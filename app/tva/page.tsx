'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileCode,
  Globe,
  History,
  Loader2,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { generateTvaDeclarationXml } from '@/app/lib/atlas-tva-xml';
import type { AtlasTvaDashboard, AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';

type Tab = 'dashboard' | 'ventes' | 'achats' | 'historique';

async function tvaFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, data };
}

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function statusBadge(status: string) {
  if (status === 'declared') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        <CheckCircle size={12} /> Déclarée
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
      <Clock size={12} /> En attente
    </span>
  );
}

export default function TVAPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AtlasTvaDashboard | null>(null);
  const [history, setHistory] = useState<AtlasTvaPeriodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declaring, setDeclaring] = useState(false);
  const [xmlDone, setXmlDone] = useState(false);

  const supabaseEnabled = isAtlasSupabaseDataEnabled();

  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (!supabaseEnabled || !cid) {
        setDashboard(null);
        setHistory([]);
        return;
      }
      const [dashRes, histRes] = await Promise.all([
        tvaFetch<{ dashboard?: AtlasTvaDashboard; error?: string }>(
          `/api/tva/dashboard?companyId=${encodeURIComponent(cid)}`,
        ),
        tvaFetch<{ periods?: AtlasTvaPeriodRecord[]; error?: string }>(
          `/api/tva/history?companyId=${encodeURIComponent(cid)}`,
        ),
      ]);
      if (!dashRes.ok) {
        setError(dashRes.data.error ?? 'Impossible de charger la TVA.');
        setDashboard(null);
      } else {
        setDashboard(dashRes.data.dashboard ?? null);
      }
      if (histRes.ok) {
        setHistory(histRes.data.periods ?? []);
      }
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = dashboard?.current ?? null;
  const salesLines = useMemo(
    () => (current?.lines ?? []).filter((l) => l.kind === 'sale'),
    [current],
  );
  const purchaseLines = useMemo(
    () => (current?.lines ?? []).filter((l) => l.kind === 'purchase'),
    [current],
  );

  const downloadXml = () => {
    if (!current) return;
    const xml = generateTvaDeclarationXml(current);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TVA_${current.periodKey}_DGI.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setXmlDone(true);
  };

  const declarePeriod = async () => {
    if (!companyId || !current || current.status === 'declared') return;
    setDeclaring(true);
    try {
      const { ok, data } = await tvaFetch<{ period?: AtlasTvaPeriodRecord; error?: string }>(
        '/api/tva/declare',
        {
          method: 'POST',
          body: JSON.stringify({ companyId, periodKey: current.periodKey }),
        },
      );
      if (!ok) {
        setError(data.error ?? 'Échec de la déclaration.');
        return;
      }
      await reload();
    } finally {
      setDeclaring(false);
    }
  };

  const sidebarItems: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Receipt },
    { id: 'ventes', label: 'Ventes', icon: Receipt },
    { id: 'achats', label: 'Achats', icon: ShoppingCart },
    { id: 'historique', label: 'Historique', icon: History },
  ];

  if (!supabaseEnabled) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-3">
            <AlertCircle className="mx-auto text-amber-600" size={32} />
            <h1 className="text-lg font-semibold text-gray-800">TVA — persistance requise</h1>
            <p className="text-sm text-gray-500">
              Le module TVA utilise vos factures et écritures en base Supabase. Activez la persistance cloud pour accéder au tableau de bord.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module">
        {sidebarItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              tab === id ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </AppSidebar>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800">Déclaration TVA</h1>
              <BetaSurfaceBadge />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Calculs réels à partir de vos factures clients, fournisseurs et écritures comptables
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadXml}
              disabled={!current}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              <FileCode size={16} /> Générer XML DGI
            </button>
            <button
              type="button"
              onClick={() => window.open('https://www.tax.gov.ma', '_blank')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
            >
              <Globe size={16} /> SIMPL-TVA
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="animate-spin" size={20} />
              Chargement TVA…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {!loading && !companyId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Sélectionnez ou créez une société active pour afficher la TVA.
            </div>
          )}

          {!loading && companyId && dashboard && tab === 'dashboard' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400">Période en cours</p>
                  <p className="text-lg font-bold text-gray-800 mt-1">{current?.periodLabel}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Régime {dashboard.regimeTVA} · {current?.periodStart} → {current?.periodEnd}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400">TVA collectée</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{formatMad(current?.tvaCollectee ?? 0)}</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs text-gray-400">TVA déductible</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{formatMad(current?.tvaDeductible ?? 0)}</p>
                </div>
                <div
                  className={`rounded-xl p-5 shadow-sm border ${
                    (current?.tvaNette ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                  }`}
                >
                  <p className="text-xs text-gray-400">TVA nette à payer</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      (current?.tvaNette ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {formatMad(current?.tvaNette ?? 0)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 lg:col-span-2">
                  <h2 className="font-semibold text-gray-700 mb-3">Situation déclarative</h2>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-400">Prochaine échéance</dt>
                      <dd className="font-medium text-gray-800">{dashboard.nextDeclarationDate}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Statut</dt>
                      <dd className="mt-0.5">{statusBadge(dashboard.status)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">CA HT (ventes)</dt>
                      <dd className="font-medium">{formatMad(current?.caHT ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Achats HT</dt>
                      <dd className="font-medium">{formatMad(current?.achatsHT ?? 0)}</dd>
                    </div>
                  </dl>
                  <div className="flex gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => void declarePeriod()}
                      disabled={declaring || current?.status === 'declared'}
                      className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] disabled:opacity-50"
                    >
                      {declaring ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      {current?.status === 'declared' ? 'Période déclarée' : 'Marquer comme déclarée'}
                    </button>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-sm text-gray-600">
                  <p className="font-semibold text-gray-700 mb-2">Sources de calcul</p>
                  <ul className="space-y-1 text-xs">
                    <li>{current?.salesCount ?? 0} facture(s) client</li>
                    <li>{current?.purchasesCount ?? 0} facture(s) fournisseur</li>
                    <li>Écritures comptables 4455 / 4456</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-3">
                    Validez toujours avec votre expert-comptable avant dépôt sur SIMPL-TVA.
                  </p>
                </div>
              </div>

              {xmlDone && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle size={20} className="text-green-500 shrink-0" />
                  <p className="text-sm text-green-700">Fichier XML généré à partir de vos données réelles.</p>
                </div>
              )}
            </>
          )}

          {!loading && current && tab === 'ventes' && (
            <InvoiceTable title="Factures ventes (TVA collectée)" lines={salesLines} counterpartyLabel="Client" />
          )}

          {!loading && current && tab === 'achats' && (
            <InvoiceTable title="Factures achats (TVA déductible)" lines={purchaseLines} counterpartyLabel="Fournisseur" />
          )}

          {!loading && tab === 'historique' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-700">Historique TVA</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Périodes {dashboard?.regimeTVA === 'trimestriel' ? 'trimestrielles' : 'mensuelles'}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-3">Période</th>
                    <th className="px-4 py-3 text-right">Collectée</th>
                    <th className="px-4 py-3 text-right">Déductible</th>
                    <th className="px-4 py-3 text-right">Nette</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        Aucune période enregistrée.
                      </td>
                    </tr>
                  )}
                  {history.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-700">{p.periodLabel}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{formatMad(p.tvaCollectee)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatMad(p.tvaDeductible)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMad(p.tvaNette)}</td>
                      <td className="px-4 py-3 text-gray-600">{p.declarationDueDate}</td>
                      <td className="px-4 py-3">{statusBadge(p.status)}</td>
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

function InvoiceTable({
  title,
  lines,
  counterpartyLabel,
}: {
  title: string;
  lines: AtlasTvaPeriodRecord['lines'];
  counterpartyLabel: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-700">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{lines.length} ligne(s)</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="px-4 py-3">Réf.</th>
            <th className="px-4 py-3">{counterpartyLabel}</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">HT</th>
            <th className="px-4 py-3 text-right">TVA</th>
            <th className="px-4 py-3 text-right">TTC</th>
            <th className="px-4 py-3">Source</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                Aucune facture sur cette période. Ajoutez des factures dans Factures ou Documents.
              </td>
            </tr>
          )}
          {lines.map((f) => (
            <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-700">{f.reference || '—'}</td>
              <td className="px-4 py-3 text-gray-600">{f.counterparty}</td>
              <td className="px-4 py-3 text-gray-500">{f.issueDate}</td>
              <td className="px-4 py-3 text-right">{formatMad(f.amountHT)}</td>
              <td className="px-4 py-3 text-right text-blue-600">{formatMad(f.vatAmount)}</td>
              <td className="px-4 py-3 text-right font-medium">{formatMad(f.totalTTC)}</td>
              <td className="px-4 py-3 text-xs text-gray-400">{f.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
