'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';

type Props = {
  fiscalYear?: number;
  className?: string;
  label?: string;
};

export function CompanyMasterExportMenu({ fiscalYear, className = '', label = 'Exporter Tout' }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const year = fiscalYear ?? new Date().getFullYear();

  useEffect(() => {
    void getActiveCompanyDbRowId().then(cid => setCompanyId(cid));
  }, []);

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

  const downloadMaster = useCallback(async () => {
    const cid = companyId ?? await getActiveCompanyDbRowId();
    if (!cid) {
      alert('Sélectionnez une société active avant d\'exporter.');
      return;
    }
    if (!companyId) setCompanyId(cid);

    setExporting(true);
    setOpen(false);
    try {
      const params = new URLSearchParams({ companyId: cid, fiscalYear: String(year) });
      const res = await fetch(`/api/company/export-master?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        alert(body.message ?? body.error ?? 'Export dossier complet impossible.');
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `Atlas_OS_Dossier_Complet_${year}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erreur réseau lors de l\'export dossier complet.');
    } finally {
      setExporting(false);
    }
  }, [companyId, year]);

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={exporting}
        className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-[#1B365D] text-white rounded-lg hover:bg-[#142847] disabled:opacity-50 transition-colors"
        title={`Exporter le dossier complet Atlas OS (Excel) — exercice ${year}`}
      >
        {exporting ? (
          <Loader2 size={14} className="animate-spin shrink-0" />
        ) : (
          <Download size={14} className="shrink-0" />
        )}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700">Dossier complet Atlas OS</p>
            <p className="text-[10px] text-gray-400 mt-0.5">6 feuilles · normes DGI / PCGE Maroc</p>
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => void downloadMaster()}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">Exporter Tout (.xlsx)</p>
                <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
                  Synthèse · Fournisseurs · TVA · IS · Banque · Journal
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
