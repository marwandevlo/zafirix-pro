'use client';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { ExportFormat } from '@/app/lib/atlas-export-engine';
import { EXPORT_LABELS } from '@/app/lib/atlas-export-engine';

type Props = {
  onExport: (format: ExportFormat) => void;
  formats?: ExportFormat[];
  disabled?: boolean;
  className?: string;
};

const DEFAULT_FORMATS: ExportFormat[] = ['pdf', 'xlsx'];

/** Inline one-click export chips for table rows. */
export function DocumentExportChips({
  onExport,
  formats = DEFAULT_FORMATS,
  disabled = false,
  className = '',
}: Props) {
  const iconFor = (fmt: ExportFormat) => {
    if (fmt === 'xlsx') return FileSpreadsheet;
    if (fmt === 'pdf' || fmt === 'docx') return FileText;
    return Download;
  };

  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`}>
      {formats.map((fmt) => {
        const Icon = iconFor(fmt);
        return (
          <button
            key={fmt}
            type="button"
            disabled={disabled}
            title={`Télécharger ${EXPORT_LABELS[fmt]}`}
            aria-label={`Exporter ${EXPORT_LABELS[fmt]}`}
            onClick={(e) => {
              e.stopPropagation();
              onExport(fmt);
            }}
            className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 hover:border-blue-200 hover:text-[#1B2A4A] disabled:opacity-50 transition-colors"
          >
            <Icon size={11} aria-hidden />
            <span className="hidden sm:inline">{EXPORT_LABELS[fmt]}</span>
          </button>
        );
      })}
    </div>
  );
}
