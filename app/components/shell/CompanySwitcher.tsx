'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { listAtlasCompanies, setActiveAtlasCompany } from '@/app/lib/atlas-companies-repository';
import type { AtlasCompany } from '@/app/types/atlas-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';

export type CompanySwitcherProps = {
  className?: string;
  onSwitch?: (company: AtlasCompany) => void;
};

export function CompanySwitcher({ className = '', onSwitch }: CompanySwitcherProps) {
  const [companies, setCompanies] = useState<AtlasCompany[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = companies.find((c) => c.actif) ?? companies[0] ?? null;

  const reload = useCallback(async () => {
    const list = await listAtlasCompanies();
    setCompanies(list);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const switchTo = async (company: AtlasCompany) => {
    if (!company.dbRowId || loading) return;
    setLoading(true);
    try {
      const prevId = active?.dbRowId ?? null;
      if (isAtlasSupabaseDataEnabled()) {
        await setActiveAtlasCompany(company.dbRowId);
        await fetch('/api/companies/health', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: company.dbRowId, fromCompanyId: prevId }),
        });
      } else if (typeof window !== 'undefined') {
        const next = companies.map((c) => ({ ...c, actif: c.dbRowId === company.dbRowId }));
        localStorage.setItem(ATLAS_STORAGE_KEYS.companies, JSON.stringify(next));
        localStorage.setItem(ATLAS_STORAGE_KEYS.activeCompany, JSON.stringify({ ...company, actif: true }));
      }
      await reload();
      onSwitch?.(company);
      setOpen(false);
      window.dispatchEvent(new CustomEvent('atlas:company-switched', { detail: { companyId: company.dbRowId } }));
    } finally {
      setLoading(false);
    }
  };

  if (!companies.length) return null;

  const label = active?.raisonSociale?.trim() || 'Société';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 max-w-[220px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 size={16} className="text-[#0F1F3D] shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
        >
          {companies.map((c) => {
            const isActive = c.dbRowId === active?.dbRowId;
            return (
              <li key={String(c.dbRowId ?? c.id)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => void switchTo(c)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${isActive ? 'bg-amber-50 text-amber-900' : 'text-gray-700'}`}
                >
                  {isActive ? <Check size={14} className="text-amber-600 shrink-0" /> : <span className="w-3.5" />}
                  <span className="truncate">{c.raisonSociale || 'Société'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
