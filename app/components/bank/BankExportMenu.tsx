'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

type Props = {
  companyId: string | null;
  statusFilter: string;
  search: string;
  reconFilter: string;
  transactionCount: number;
  size?: 'sm' | 'xs';
};

export function BankExportMenu({
  companyId,
  statusFilter,
  search,
  reconFilter,
  transactionCount,
  size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const btnSize = size === 'xs' ? 'text-xs px-2 py-1 gap-1' : 'text-sm px-3 py-1.5 gap-1.5';
  const tooltip = transactionCount > 0
    ? `Exporter ${transactionCount} opération${transactionCount > 1 ? 's' : ''} (filtres appliqués)`
    : 'Exporter — aucune opération avec les filtres actuels (fichier vide avec en-têtes)';

  const downloadExport = async (format: 'xlsx' | 'csv') => {
    if (!companyId) return;
    setExporting(format);
    setOpen(false);
    try {
      const params = new URLSearchParams({
        companyId,
        format,
        recon: reconFilter,
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/bank/export?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        alert(body.message ?? body.error ?? 'Export impossible.');
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `Operations_Bancaires_${new Date().getFullYear()}.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erreur réseau lors de l\'export.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={exporting !== null || !companyId}
        className={`flex items-center font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors ${btnSize}`}
        title={!companyId ? 'Société active requise pour exporter' : tooltip}
      >
        {exporting ? (
          <Loader2 size={size === 'xs' ? 12 : 14} className="animate-spin shrink-0" />
        ) : (
          <Download size={size === 'xs' ? 12 : 14} className="shrink-0" />
        )}
        <span>Exporter</span>
        <ChevronDown size={size === 'xs' ? 10 : 12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700">
              Exporter — {transactionCount} opération{transactionCount !== 1 ? 's' : ''}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {transactionCount > 0
                ? 'Données filtrées depuis la base'
                : 'Aucune ligne — export avec en-têtes uniquement'}
            </p>
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => void downloadExport('xlsx')}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">Exporter en Excel (.xlsx)</p>
                <p className="text-[10px] text-gray-400">Montants formatés #,##0.00 MAD</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void downloadExport('csv')}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <FileText size={16} className="text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">Exporter en CSV (.csv)</p>
                <p className="text-[10px] text-gray-400">Séparateur point-virgule · UTF-8</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
