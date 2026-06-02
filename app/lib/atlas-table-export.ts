/**
 * atlas-table-export.ts
 *
 * Client-side export utilities for tabular data.
 * Supports CSV, Excel (XLSX), PDF (jsPDF + AutoTable), and JSON.
 *
 * All functions trigger a browser download and return void.
 * No server round-trip — instant, works with filtered/selected data.
 */

'use client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportColumn = {
  /** Key in the data row object */
  key: string;
  /** Column header as displayed to the user */
  label: string;
  /** Optional cell value formatter */
  format?: (value: unknown, row: Record<string, unknown>) => string;
  /** Skip this column in export (e.g. action buttons) */
  skipExport?: boolean;
};

export type ExportMeta = {
  title?: string;
  /** Applied filter description */
  filters?: Record<string, unknown>;
  exportedAt?: string;
  totalRows?: number;
  selectedRows?: number;
  /** Extra context (company name, period, etc.) */
  context?: Record<string, string>;
};

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'json';

// ── Cell value resolver ───────────────────────────────────────────────────────

function cellValue(col: ExportColumn, row: Record<string, unknown>): string {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw == null) return '';
  if (typeof raw === 'boolean') return raw ? 'Oui' : 'Non';
  if (typeof raw === 'number') return String(raw);
  return String(raw);
}

function rows2matrix(
  data: Record<string, unknown>[],
  cols: ExportColumn[],
): string[][] {
  const activeCols = cols.filter(c => !c.skipExport);
  const header = activeCols.map(c => c.label);
  const body = data.map(row => activeCols.map(col => cellValue(col, row)));
  return [header, ...body];
}

// ── Browser download trigger ──────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 250);
}

// ── Timestamp helper ──────────────────────────────────────────────────────────

function isoNow(): string { return new Date().toISOString(); }
function fileTs(): string { return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-'); }

// ── CSV ───────────────────────────────────────────────────────────────────────

export function exportToCSV(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  meta?: ExportMeta,
): void {
  const matrix = rows2matrix(data, columns);
  const lines = matrix.map(row =>
    row.map(cell => {
      const s = String(cell).replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    }).join(',')
  );

  // Metadata footer
  if (meta) {
    lines.push('');
    lines.push(`# Exporté le,${meta.exportedAt ?? isoNow()}`);
    if (meta.title) lines.push(`# Rapport,${meta.title}`);
    if (meta.totalRows != null) lines.push(`# Total lignes,${meta.totalRows}`);
    if (meta.selectedRows != null) lines.push(`# Lignes sélectionnées,${meta.selectedRows}`);
    if (meta.filters) {
      for (const [k, v] of Object.entries(meta.filters)) {
        if (v != null && v !== '' && v !== 'all') lines.push(`# Filtre ${k},${String(v)}`);
      }
    }
    if (meta.context) {
      for (const [k, v] of Object.entries(meta.context)) {
        lines.push(`# ${k},${v}`);
      }
    }
  }

  const csv = lines.join('\r\n');
  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}_${fileTs()}.csv`);
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

export async function exportToXLSX(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  meta?: ExportMeta,
): Promise<void> {
  const XLSX = await import('xlsx');
  const activeCols = columns.filter(c => !c.skipExport);
  const ws_data: (string | number)[][] = [];

  // Header row
  ws_data.push(activeCols.map(c => c.label));

  // Data rows
  for (const row of data) {
    ws_data.push(activeCols.map(col => {
      const raw = row[col.key];
      if (col.format) return col.format(raw, row);
      if (raw == null) return '';
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'boolean') return raw ? 'Oui' : 'Non';
      return String(raw);
    }));
  }

  // Metadata sheet
  const meta_data: string[][] = [
    ['Exporté le', meta?.exportedAt ?? isoNow()],
    ['Total lignes', String(data.length)],
  ];
  if (meta?.title) meta_data.unshift(['Rapport', meta.title]);
  if (meta?.selectedRows != null) meta_data.push(['Lignes sélectionnées', String(meta.selectedRows)]);
  if (meta?.filters) {
    for (const [k, v] of Object.entries(meta.filters)) {
      if (v != null && v !== '' && v !== 'all') meta_data.push([`Filtre: ${k}`, String(v)]);
    }
  }
  if (meta?.context) {
    for (const [k, v] of Object.entries(meta.context)) meta_data.push([k, v]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Column width auto-sizing
  const colWidths = activeCols.map((col, i) => {
    const maxLen = Math.max(col.label.length, ...ws_data.slice(1).map(r => String(r[i] ?? '').length));
    return { wch: Math.min(50, Math.max(10, maxLen + 2)) };
  });
  ws['!cols'] = colWidths;

  // Style header row (bold)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } } };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Données');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta_data), 'Métadonnées');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${filename}_${fileTs()}.xlsx`);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function exportToPDF(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  meta?: ExportMeta,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const activeCols = columns.filter(c => !c.skipExport);
  const doc = new jsPDF({ orientation: activeCols.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  const title = meta?.title ?? filename;
  const exportedAt = meta?.exportedAt ?? isoNow();

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Exporté le ${new Date(exportedAt).toLocaleString('fr-FR')}`, 14, 25);
  doc.text(`${data.length} ligne${data.length > 1 ? 's' : ''}`, 14, 30);

  // Filters context
  let yOffset = 33;
  if (meta?.filters) {
    const activeFilters = Object.entries(meta.filters)
      .filter(([, v]) => v != null && v !== '' && v !== 'all')
      .map(([k, v]) => `${k}: ${String(v)}`);
    if (activeFilters.length > 0) {
      doc.text(`Filtres: ${activeFilters.join(' | ')}`, 14, yOffset);
      yOffset += 5;
    }
  }

  // Table
  autoTable(doc, {
    startY: yOffset + 2,
    head: [activeCols.map(c => c.label)],
    body: data.map(row => activeCols.map(col => cellValue(col, row))),
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [225, 29, 72], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {},
    margin: { left: 14, right: 14 },
    tableLineColor: [229, 231, 235],
    tableLineWidth: 0.1,
  });

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Zafirix Pro · ${title} · Page ${i}/${pageCount}`, 14, doc.internal.pageSize.height - 8);
  }

  doc.save(`${filename}_${fileTs()}.pdf`);
}

// ── JSON ──────────────────────────────────────────────────────────────────────

export function exportToJSON(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  meta?: ExportMeta,
): void {
  const activeCols = columns.filter(c => !c.skipExport);
  const colKeys = new Set(activeCols.map(c => c.key));

  const rows = data.map(row => {
    const out: Record<string, unknown> = {};
    for (const col of activeCols) {
      const raw = row[col.key];
      out[col.key] = col.format ? col.format(raw, row) : raw ?? null;
    }
    // Always include source_document_id and validation_status if present in raw data
    if (row.source_document_id != null && !colKeys.has('source_document_id')) {
      out.source_document_id = row.source_document_id;
    }
    if (row.validation_status != null && !colKeys.has('validation_status')) {
      out.validation_status = row.validation_status;
    }
    return out;
  });

  const payload = {
    exported_at: meta?.exportedAt ?? isoNow(),
    title: meta?.title ?? filename,
    total_rows: data.length,
    filters: meta?.filters ?? null,
    context: meta?.context ?? null,
    columns: activeCols.map(c => ({ key: c.key, label: c.label })),
    data: rows,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, `${filename}_${fileTs()}.json`);
}

// ── Full payload (raw) ────────────────────────────────────────────────────────

export function exportFullPayload(
  data: Record<string, unknown>[],
  filename: string,
  meta?: ExportMeta,
): void {
  const payload = {
    exported_at: meta?.exportedAt ?? isoNow(),
    title: meta?.title ?? filename,
    total_rows: data.length,
    filters: meta?.filters ?? null,
    context: meta?.context ?? null,
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, `${filename}_payload_${fileTs()}.json`);
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────

export async function copyAsJSON(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
): Promise<void> {
  const activeCols = columns.filter(c => !c.skipExport);
  const rows = data.map(row => {
    const out: Record<string, unknown> = {};
    for (const col of activeCols) {
      out[col.key] = row[col.key] ?? null;
    }
    return out;
  });
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
  }
}

// ── Unified dispatcher ────────────────────────────────────────────────────────

export async function exportTable(
  format: ExportFormat | 'payload',
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
  meta?: ExportMeta,
): Promise<void> {
  switch (format) {
    case 'csv':     return exportToCSV(data, columns, filename, meta);
    case 'xlsx':    return exportToXLSX(data, columns, filename, meta);
    case 'pdf':     return exportToPDF(data, columns, filename, meta);
    case 'json':    return exportToJSON(data, columns, filename, meta);
    case 'payload': return exportFullPayload(data, filename, meta);
  }
}
