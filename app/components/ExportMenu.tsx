'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, FileSpreadsheet, FileText, Braces, Package,
  Copy, ChevronDown, Loader2, CheckCheck,
} from 'lucide-react';
import { exportTable, copyAsJSON } from '@/app/lib/atlas-table-export';
import type { ExportColumn, ExportMeta } from '@/app/lib/atlas-table-export';
import { resolveRowId } from '@/app/components/data-grid/global-table-id';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ExportColumn };

export type ExportMenuProps = {
  /** All rows currently visible (post-filter) */
  data: Record<string, unknown>[];
  /** Column definitions — key + label + optional formatter */
  columns: ExportColumn[];
  /** Base filename (without extension or timestamp) */
  filename: string;
  /** Optional title shown in PDF header and JSON metadata */
  title?: string;
  /** Which formats to show (default: all) */
  formats?: Array<'csv' | 'xlsx' | 'pdf' | 'json' | 'payload'>;
  /** Currently selected row IDs (if any) — exported instead of all data */
  selectedIds?: Set<string>;
  /** Key in data row that represents the row ID (default: 'id') */
  idKey?: string;
  /** Active filter values, included in metadata */
  filters?: Record<string, unknown>;
  /** Extra context lines included in metadata (company, period, etc.) */
  context?: Record<string, string>;
  /** Button size: 'sm' or 'xs' */
  size?: 'sm' | 'xs';
  /** Optional additional class names */
  className?: string;
  /** Align dropdown: 'left' | 'right' (default: 'right') */
  align?: 'left' | 'right';
};

// ── Format definitions ────────────────────────────────────────────────────────

type FormatOption = {
  id: 'csv' | 'xlsx' | 'pdf' | 'json' | 'payload';
  label: string;
  sublabel: string;
  icon: React.ElementType;
  iconColor: string;
};

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'csv',     label: 'CSV',            sublabel: 'Tableau séparé par virgules',   icon: FileText,       iconColor: 'text-green-600' },
  { id: 'xlsx',    label: 'Excel',          sublabel: 'Classeur .xlsx avec métadonnées', icon: FileSpreadsheet, iconColor: 'text-emerald-600' },
  { id: 'pdf',     label: 'PDF',            sublabel: 'Document imprimable A4',         icon: FileText,       iconColor: 'text-red-600' },
  { id: 'json',    label: 'JSON',           sublabel: 'Données structurées',            icon: Braces,         iconColor: 'text-blue-600' },
  { id: 'payload', label: 'Payload complet',sublabel: 'Toutes les données brutes',      icon: Package,        iconColor: 'text-purple-600' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ExportMenu({
  data,
  columns,
  filename,
  title,
  formats,
  selectedIds,
  idKey = 'id',
  filters,
  context,
  size = 'sm',
  className = '',
  align = 'right',
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeFormats = formats ?? ['csv', 'xlsx', 'pdf', 'json', 'payload'];
  const visibleFormats = FORMAT_OPTIONS.filter(f => activeFormats.includes(f.id));

  // Determine export dataset
  const exportData = useCallback((): Record<string, unknown>[] => {
    if (selectedIds && selectedIds.size > 0) {
      return data.filter((row, index) => {
        const rowId = idKey === 'id'
          ? resolveRowId(row, index)
          : String(row[idKey] ?? resolveRowId(row, index));
        return selectedIds.has(rowId);
      });
    }
    return data;
  }, [data, selectedIds, idKey]);

  const buildMeta = (format: string): ExportMeta => ({
    title: title ?? filename,
    filters,
    context,
    exportedAt: new Date().toISOString(),
    totalRows: data.length,
    selectedRows: selectedIds && selectedIds.size > 0 ? selectedIds.size : undefined,
  });

  const handleExport = async (format: FormatOption['id']) => {
    setExporting(format);
    setOpen(false);
    try {
      const rows = exportData();
      await exportTable(format, rows, columns, filename, buildMeta(format));
    } catch (err) {
      console.error('[ExportMenu]', format, err);
      const message = err instanceof Error ? err.message : 'Export impossible';
      window.alert(`Export ${format.toUpperCase()} échoué : ${message}`);
    } finally {
      setExporting(null);
    }
  };

  const handleCopy = async () => {
    setCopied(false);
    try {
      await copyAsJSON(exportData(), columns);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const rows = exportData();
  const count = rows.length;
  const hasSelection = selectedIds && selectedIds.size > 0;

  const btnSize = size === 'xs'
    ? 'text-xs px-2 py-1 gap-1'
    : 'text-sm px-3 py-1.5 gap-1.5';

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={exporting !== null}
        className={`flex items-center font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors ${btnSize}`}
        title={
          count > 0
            ? `Exporter ${count} ligne${count !== 1 ? 's' : ''}${hasSelection ? ' sélectionnée(s)' : ''}`
            : 'Exporter — fichier vide avec en-têtes de colonnes'
        }
      >
        {exporting ? (
          <Loader2 size={size === 'xs' ? 12 : 14} className="animate-spin shrink-0" />
        ) : (
          <Download size={size === 'xs' ? 12 : 14} className="shrink-0" />
        )}
        <span>Exporter</span>
        {hasSelection && (
          <span className="bg-rose-100 text-rose-700 text-[10px] px-1 py-0.5 rounded font-semibold">
            {selectedIds!.size}
          </span>
        )}
        <ChevronDown size={size === 'xs' ? 10 : 12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute z-[100] mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700">
              Exporter — {count} ligne{count !== 1 ? 's' : ''}
              {hasSelection ? ` (${selectedIds!.size} sélectionnée${selectedIds!.size > 1 ? 's' : ''})` : ''}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Inclut: colonnes visibles · source_document_id · statut · date</p>
          </div>

          {/* Format options */}
          <div className="py-1">
            {visibleFormats.map(fmt => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => void handleExport(fmt.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <fmt.icon size={16} className={`shrink-0 ${fmt.iconColor}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{fmt.label}</p>
                  <p className="text-[10px] text-gray-400 leading-none mt-0.5">{fmt.sublabel}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Copy to clipboard */}
          <div className="border-t border-gray-100 py-1">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              {copied ? (
                <CheckCheck size={16} className="text-green-600 shrink-0" />
              ) : (
                <Copy size={16} className="text-gray-500 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{copied ? 'Copié !' : 'Copier JSON'}</p>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5">Copier dans le presse-papiers</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportMenu;
