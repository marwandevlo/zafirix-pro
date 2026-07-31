'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Search, ExternalLink, Mail, Shield, Eye, ChevronRight,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { CompanySwitcher } from '@/app/components/shell/CompanySwitcher';
import type { CabinetClientRow, HealthBand } from '@/app/types/atlas-workspace';
import { healthBandLabelFr } from '@/app/lib/atlas-company-health-engine';
import { setActiveAtlasCompany } from '@/app/lib/atlas-companies-repository';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { notifyCompanyWorkspaceSwitched } from '@/app/lib/atlas-company-switch-event';

function bandBadge(band: HealthBand): string {
  switch (band) {
    case 'healthy': return 'bg-green-100 text-green-800';
    case 'critical': return 'bg-red-100 text-red-800';
    default: return 'bg-amber-100 text-amber-800';
  }
}

export default function CabinetPortfolioPage() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<CabinetClientRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cabinet/portfolio', { credentials: 'include' });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? 'Erreur chargement portfolio');
        setPortfolio([]);
        return;
      }
      setPortfolio(json.portfolio ?? []);
    } catch {
      setError('Impossible de charger le portfolio cabinet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = portfolio.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.clientLabel.toLowerCase().includes(q) || p.companyName?.toLowerCase().includes(q);
  });

  const openClient = async (row: CabinetClientRow) => {
    const prevId = await getActiveCompanyDbRowId();
    await setActiveAtlasCompany(row.companyId);
    await fetch('/api/companies/health', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: row.companyId }),
    });
    notifyCompanyWorkspaceSwitched(row.companyId, prevId);
    router.push('/');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Portfolio clients — Cabinet</h1>
            <p className="text-sm text-gray-500">Vue multi-sociétés pour cabinets comptables</p>
          </div>
          <CompanySwitcher />
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
              <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-600">Aucun client dans le portfolio.</p>
              <p className="text-sm text-gray-400 mt-1">Ajoutez des sociétés dans Mes sociétés pour les gérer ici.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Readiness</th>
                    <th className="px-4 py-3">Alertes</th>
                    <th className="px-4 py-3">TVA</th>
                    <th className="px-4 py-3">Paie</th>
                    <th className="px-4 py-3">Santé</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.companyId} className="border-t border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.clientLabel}</td>
                      <td className="px-4 py-3">{row.readinessScore}%</td>
                      <td className="px-4 py-3">{row.alertCount}</td>
                      <td className="px-4 py-3">{row.alertCount > 0 ? '⚠' : '—'}</td>
                      <td className="px-4 py-3">{row.healthBand === 'critical' ? '⚠' : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${bandBadge(row.healthBand)}`}>
                          {row.healthScore}% · {healthBandLabelFr(row.healthBand)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => void openClient(row)} className="p-1.5 rounded hover:bg-gray-100" title="Ouvrir">
                            <ExternalLink size={14} />
                          </button>
                          <button type="button" onClick={() => router.push('/audit')} className="p-1.5 rounded hover:bg-gray-100" title="Audit">
                            <Shield size={14} />
                          </button>
                          <button type="button" onClick={() => router.push('/assistant')} className="p-1.5 rounded hover:bg-gray-100" title="Review">
                            <Eye size={14} />
                          </button>
                          {row.contactEmail && (
                            <a href={`mailto:${row.contactEmail}`} className="p-1.5 rounded hover:bg-gray-100" title="Contact">
                              <Mail size={14} />
                            </a>
                          )}
                          <ChevronRight size={14} className="text-gray-300" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
