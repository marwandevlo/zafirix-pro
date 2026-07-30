'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Brain,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  BriefingLanguage,
  ExecutiveBriefingMetrics,
  ExecutiveBriefingReport,
} from '@/app/types/atlas-executive-briefing';
import { BRIEFING_LANGUAGE_LABELS } from '@/app/types/atlas-executive-briefing';
import type { AtlasMonthlyEvolutionPoint, AtlasReportPeriod } from '@/app/types/atlas-reports';

type PeriodPreset = 'month' | 'quarter' | 'year';

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'warning' | 'neutral';
  icon: React.ReactNode;
}) {
  const tones = {
    positive: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    negative: 'text-red-700 bg-red-50 border-red-100',
    warning: 'text-orange-700 bg-orange-50 border-orange-100',
    neutral: 'text-gray-800 bg-white border-gray-100',
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-gray-500">{label}</p>
        <span className="text-gray-400">{icon}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function TrendMiniChart({ points }: { points: AtlasMonthlyEvolutionPoint[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.ca), 1);
  return (
    <div className="flex items-end gap-1 h-16 mt-2">
      {points.slice(-6).map((p) => (
        <div key={p.monthKey} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-indigo-200 rounded-t"
            style={{ height: `${Math.max(8, (p.ca / max) * 56)}px` }}
            title={`${p.label}: ${formatMad(p.ca)}`}
          />
          <span className="text-[8px] text-gray-400 truncate w-full text-center">{p.label.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

export default function BriefingCeoPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [language, setLanguage] = useState<BriefingLanguage>('fr');
  const [metrics, setMetrics] = useState<ExecutiveBriefingMetrics | null>(null);
  const [period, setPeriod] = useState<AtlasReportPeriod | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [monthlyTrend, setMonthlyTrend] = useState<AtlasMonthlyEvolutionPoint[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [narrative, setNarrative] = useState('');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMetrics = useCallback(async (cid: string, p: PeriodPreset) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{
      metrics?: ExecutiveBriefingMetrics;
      period?: AtlasReportPeriod;
      companyName?: string;
      monthlyTrend?: AtlasMonthlyEvolutionPoint[];
      highlights?: string[];
      risks?: string[];
    }>(`/api/executive-briefing?companyId=${encodeURIComponent(cid)}&preset=${p}`);
    if (!result.ok) {
      setLoadError(result.error);
      setMetrics(null);
    } else {
      setMetrics(result.data.metrics ?? null);
      setPeriod(result.data.period ?? null);
      setCompanyName(result.data.companyName ?? '');
      setMonthlyTrend(result.data.monthlyTrend ?? []);
      setHighlights(result.data.highlights ?? []);
      setRisks(result.data.risks ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  const generateBriefing = useCallback(async (cid: string, p: PeriodPreset, lang: BriefingLanguage) => {
    setGenerating(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/executive-briefing?companyId=${encodeURIComponent(cid)}&preset=${p}&lang=${lang}&generate=1`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
        setLoadError(err.message ?? err.error ?? 'Génération impossible');
        return;
      }
      const data = await res.json() as ExecutiveBriefingReport & { ok?: boolean };
      setMetrics(data.metrics);
      setPeriod(data.period);
      setCompanyName(data.companyName);
      setMonthlyTrend(data.monthlyTrend);
      setHighlights(data.highlights);
      setRisks(data.risks);
      setNarrative(data.narrative);
      setRecommendations(data.recommendations ?? []);
      setProvider(data.provider);
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await loadMetrics(cid, preset);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => {
      setCompanyId(cid);
      if (cid) void loadMetrics(cid, preset);
    });
    return off;
  }, [loadMetrics, preset]);

  useEffect(() => {
    if (companyId) void loadMetrics(companyId, preset);
  }, [preset, companyId, loadMetrics]);

  const m = metrics;
  const cashTone = m && m.netCashFlow >= 0 ? 'positive' : 'negative';

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Brain size={20} className="text-indigo-600" />
                <h1 className="text-xl font-bold text-gray-800">Briefing CEO</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Synthèse IA — trésorerie, CA, créances et KPIs financiers
                {companyName && ` · ${companyName}`}
              </p>
              {period && <p className="text-xs text-gray-400 mt-0.5">Période : {period.periodLabel}</p>}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as PeriodPreset)}
                className="text-xs border rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="month">Ce mois</option>
                <option value="quarter">Ce trimestre</option>
                <option value="year">Cette année</option>
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as BriefingLanguage)}
                className="text-xs border rounded-lg px-2 py-1.5 bg-white"
                aria-label="Langue du briefing"
              >
                {(Object.entries(BRIEFING_LANGUAGE_LABELS) as [BriefingLanguage, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!companyId || generating}
                onClick={() => companyId && void generateBriefing(companyId, preset, language)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Générer le briefing IA
              </button>
              <button
                type="button"
                disabled={!companyId || loading}
                onClick={() => companyId && void loadMetrics(companyId, preset)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="le briefing CEO" />}

          {loading && !m ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
          ) : m ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  label="Chiffre d'affaires HT"
                  value={formatMad(m.turnover)}
                  sub={`${m.invoicesIssued} facture(s) émise(s)`}
                  tone="positive"
                  icon={<TrendingUp size={16} />}
                />
                <KpiCard
                  label="Encaissements"
                  value={formatMad(m.collections)}
                  sub="Paiements reçus sur la période"
                  tone="neutral"
                  icon={<Banknote size={16} />}
                />
                <KpiCard
                  label="Flux de trésorerie net"
                  value={formatMad(m.netCashFlow)}
                  sub={`Dépenses fourn. : ${formatMad(m.supplierExpenses)}`}
                  tone={cashTone}
                  icon={m.netCashFlow >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                />
                <KpiCard
                  label="Créances en cours"
                  value={formatMad(m.outstandingDebt)}
                  sub={`${m.overdueInvoices} en retard · ${m.activeDebtCases} dossier(s)`}
                  tone={m.outstandingDebt > 0 ? 'warning' : 'neutral'}
                  icon={<AlertTriangle size={16} />}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Wallet size={14} className="text-violet-500" /> Indicateurs complémentaires
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-400">Position bancaire</p>
                      <p className="font-semibold">{formatMad(m.bankBalance)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-400">TVA nette</p>
                      <p className="font-semibold">{formatMad(m.tvaNet)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-400">Montant impayés</p>
                      <p className="font-semibold text-orange-700">{formatMad(m.overdueAmount)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-400">Clients à risque</p>
                      <p className="font-semibold">{m.highRiskClients}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-400">Marge brute est.</p>
                      <p className="font-semibold">{m.grossMarginPct != null ? `${m.grossMarginPct} %` : '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-400">Factures impayées</p>
                      <p className="font-semibold">{m.unpaidInvoices}</p>
                    </div>
                  </div>
                  {monthlyTrend.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-gray-400 mb-1">Évolution du CA</p>
                      <TrendMiniChart points={monthlyTrend} />
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">Points clés</h2>
                  <ul className="space-y-2">
                    {highlights.map((h) => (
                      <li key={h} className="text-xs text-gray-600 flex gap-2">
                        <span className="text-indigo-400 shrink-0">•</span>
                        {h}
                      </li>
                    ))}
                    {highlights.length === 0 && <p className="text-xs text-gray-400">Aucun point clé</p>}
                  </ul>
                  {risks.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                        <AlertTriangle size={12} /> Risques ({risks.length})
                      </p>
                      <ul className="space-y-1 max-h-32 overflow-y-auto">
                        {risks.slice(0, 4).map((r) => (
                          <li key={r} className="text-[10px] text-gray-500 line-clamp-2">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-violet-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-600" />
                    <h2 className="text-sm font-semibold text-gray-800">Briefing IA — insights dirigeant</h2>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <Globe size={12} />
                    {BRIEFING_LANGUAGE_LABELS[language]}
                    {provider && <span>· {provider}</span>}
                  </div>
                </div>
                <div className="p-4 lg:p-6">
                  {generating ? (
                    <div className="flex items-center gap-3 py-8 justify-center text-gray-500">
                      <Loader2 size={20} className="animate-spin text-indigo-500" />
                      <span className="text-sm">Analyse en cours…</span>
                    </div>
                  ) : narrative ? (
                    <div className="prose prose-sm max-w-none">
                      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed" dir={language === 'ar' || language === 'darija' ? 'rtl' : 'ltr'}>
                        {narrative}
                      </div>
                      {recommendations.length > 0 && (
                        <div className="mt-6 pt-4 border-t">
                          <h3 className="text-xs font-semibold text-indigo-700 mb-2">Recommandations prioritaires</h3>
                          <ul className="space-y-2">
                            {recommendations.map((rec) => (
                              <li key={rec} className="text-xs text-gray-600 flex gap-2">
                                <span className="text-indigo-500 shrink-0">→</span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Brain size={32} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-sm text-gray-500 mb-4">
                        Cliquez sur « Générer le briefing IA » pour obtenir une synthèse exécutive
                        en {BRIEFING_LANGUAGE_LABELS[language]}.
                      </p>
                      <button
                        type="button"
                        disabled={!companyId}
                        onClick={() => companyId && void generateBriefing(companyId, preset, language)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Sparkles size={16} /> Générer maintenant
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
