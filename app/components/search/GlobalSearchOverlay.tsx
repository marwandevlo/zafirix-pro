'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, FileText, Building2, File, Users, Loader2 } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { listAtlasDocuments } from '@/app/lib/atlas-documents-repository';
import { listAtlasEmployees } from '@/app/lib/atlas-employees-repository';

type Hit = {
  type: 'invoice' | 'company' | 'document' | 'employee';
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
};

function iconFor(type: Hit['type']) {
  if (type === 'invoice') return FileText;
  if (type === 'company') return Building2;
  if (type === 'employee') return Users;
  return File;
}

export function GlobalSearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPalette = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onOpenEvent = () => openPalette();
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k';
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        openPalette();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('atlas:open-search', onOpenEvent as EventListener);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('atlas:open-search', onOpenEvent as EventListener);
    };
  }, [openPalette]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setHits([]);
      return;
    }

    setLoading(true);
    try {
      if (isAtlasSupabaseDataEnabled()) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          setHits([]);
          return;
        }
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as { hits?: Hit[] };
        setHits(Array.isArray(data.hits) ? data.hits : []);
        return;
      }

      // Local demo mode: pull from repositories and filter client-side.
      const [invoices, companies, documents, employees] = await Promise.all([
        listAtlasInvoices(),
        listAtlasCompanies(),
        listAtlasDocuments(),
        listAtlasEmployees(),
      ]);
      const needle = trimmed.toLowerCase();

      const localHits: Hit[] = [];
      for (const inv of invoices) {
        const hay = `${inv.number} ${inv.clientName}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        localHits.push({ type: 'invoice', id: String(inv.id), title: inv.number, subtitle: inv.clientName, href: `/factures?id=${encodeURIComponent(String(inv.id))}` });
      }
      for (const c of companies) {
        const hay = `${c.raisonSociale} ${c.if_fiscal} ${c.ville}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        localHits.push({ type: 'company', id: String(c.id), title: c.raisonSociale, subtitle: c.ville, href: '/companies' });
      }
      for (const d of documents) {
        const hay = `${d.title} ${d.type} ${d.kind}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        localHits.push({ type: 'document', id: String(d.id), title: d.title, subtitle: d.type, href: '/documents' });
      }
      for (const e of employees) {
        const hay = `${e.fullName} ${e.roleTitle ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        localHits.push({ type: 'employee', id: String(e.id), title: e.fullName, subtitle: e.roleTitle, href: '/rh' });
      }
      setHits(localHits.slice(0, 40));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void runSearch(query), 150);
    return () => window.clearTimeout(t);
  }, [query, open, runSearch]);

  const grouped = useMemo(() => {
    const g: Record<string, Hit[]> = { invoice: [], company: [], document: [], employee: [] };
    for (const h of hits) g[h.type].push(h);
    return g;
  }, [hits]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-65">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-16 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <Search size={18} className="text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher dans factures, sociétés, documents, employés…"
                className="flex-1 text-sm outline-none"
              />
              {loading && <Loader2 size={16} className="text-gray-400 animate-spin" />}
              <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {hits.length === 0 && query.trim() && !loading && (
                <div className="p-6 text-center text-sm text-gray-400">Aucun résultat.</div>
              )}

              {(['invoice', 'company', 'document', 'employee'] as const).map((type) => {
                const items = grouped[type];
                if (!items.length) return null;
                const label = type === 'invoice' ? 'Factures' : type === 'company' ? 'Sociétés' : type === 'document' ? 'Documents' : 'Employés';
                return (
                  <div key={type} className="mb-2">
                    <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
                    <div className="space-y-1">
                      {items.map((h) => {
                        const Icon = iconFor(h.type);
                        return (
                          <a
                            key={`${h.type}:${h.id}`}
                            href={h.href ?? '#'}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-gray-50"
                          >
                            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                              <Icon size={16} className="text-gray-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{h.title}</p>
                              {h.subtitle && <p className="text-xs text-gray-400 truncate">{h.subtitle}</p>}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

