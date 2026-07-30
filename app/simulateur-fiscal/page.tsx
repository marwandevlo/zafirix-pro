'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Calculator,
  Loader2,
  Save,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { EXPERT_DISCLAIMER } from '@/app/lib/atlas-payroll-calculations';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  SavedWhatIfScenario,
  WhatIfAdjustments,
  WhatIfAiProjection,
  WhatIfBaseline,
  WhatIfComparison,
} from '@/app/types/atlas-tax-whatif';

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function DeltaBadge({ value, suffix = ' MAD' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-gray-400 text-xs">—</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-red-600' : 'text-green-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{value.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}{suffix}
    </span>
  );
}

const DEFAULT_ADJUSTMENTS: WhatIfAdjustments = {
  revenueDeltaPct: 0,
  supplierDeltaPct: 0,
  payrollDeltaPct: 0,
  accountingDeltaPct: 0,
  assetPurchaseHT: 0,
};

export default function SimulateurFiscalPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [baseline, setBaseline] = useState<WhatIfBaseline | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedWhatIfScenario[]>([]);
  const [adjustments, setAdjustments] = useState<WhatIfAdjustments>(DEFAULT_ADJUSTMENTS);
  const [comparison, setComparison] = useState<WhatIfComparison | null>(null);
  const [projection, setProjection] = useState<WhatIfAiProjection | null>(null);
  const [scenarioName, setScenarioName] = useState('Scénario A');
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (cid: string, year: number) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{
      baseline?: WhatIfBaseline;
      savedScenarios?: SavedWhatIfScenario[];
    }>(`/api/tax-whatif?companyId=${encodeURIComponent(cid)}&fiscalYear=${year}`);
    if (!result.ok) {
      setLoadError(result.error);
      setBaseline(null);
    } else {
      setBaseline(result.data.baseline ?? null);
      setSavedScenarios(result.data.savedScenarios ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid, fiscalYear);
    })();
  }, [load, fiscalYear]);

  useEffect(() => {
    return onCompanySwitched(() => {
      void (async () => {
        const cid = await getActiveCompanyDbRowId();
        setCompanyId(cid);
        if (cid) await load(cid, fiscalYear);
      })();
    });
  }, [load, fiscalYear]);

  const runCompute = async () => {
    if (!companyId) return;
    setComputing(true);
    setProjection(null);
    try {
      const res = await fetch('/api/tax-whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'compute',
          companyId,
          fiscalYear,
          adjustments,
          label: scenarioName,
          baseline,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'compute_failed');
      setComparison(data.comparison as WhatIfComparison);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Calcul échoué.');
    } finally {
      setComputing(false);
    }
  };

  const runAiProjection = async () => {
    if (!companyId) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/tax-whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'ai_project',
          companyId,
          fiscalYear,
          adjustments,
          label: scenarioName,
          baseline,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message ?? data.error ?? 'ai_failed');
      setComparison(data.comparison as WhatIfComparison);
      setProjection(data.projection as WhatIfAiProjection);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Projection IA échouée.');
    } finally {
      setAiLoading(false);
    }
  };

  const saveScenario = async () => {
    if (!companyId || !comparison) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tax-whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save',
          companyId,
          fiscalYear,
          name: scenarioName,
          baseline: comparison.baseline,
          adjustments: comparison.adjustments,
          results: comparison.scenario,
          aiProjection: projection?.summary,
          aiProvider: projection?.provider,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save_failed');
      await load(companyId, fiscalYear);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Sauvegarde échouée.');
    } finally {
      setSaving(false);
    }
  };

  const scenario = comparison?.scenario;
  const delta = scenario?.deltaVsBaseline;

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const setPct = (key: keyof WhatIfAdjustments, value: number) => {
    setAdjustments((a) => ({ ...a, [key]: value }));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Calculator className="h-6 w-6 text-indigo-600" />
                <h1 className="text-xl font-semibold text-gray-900">Simulateur fiscal IA</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                What-if IS &amp; TVA — simulez CA, charges, investissements et projetez vos impôts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">
                Exercice
                <select
                  className="ml-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(Number(e.target.value))}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="le simulateur fiscal" />}
          {loadError && <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : baseline ? (
            <>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">CA HT baseline</p>
                  <p className="text-lg font-semibold">{formatMad(baseline.revenueHT)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">Résultat fiscal baseline</p>
                  <p className="text-lg font-semibold">{formatMad(baseline.taxableResult)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">IS dû baseline</p>
                  <p className="text-lg font-semibold text-indigo-700">{formatMad(baseline.is.isDue)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">TVA nette baseline</p>
                  <p className="text-lg font-semibold">{formatMad(baseline.tvaNet)}</p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border p-5 space-y-5">
                  <h2 className="text-sm font-semibold text-gray-800">Hypothèses du scénario</h2>
                  <label className="block">
                    <span className="text-xs text-gray-500">Nom du scénario</span>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={scenarioName}
                      onChange={(e) => setScenarioName(e.target.value)}
                    />
                  </label>

                  {([
                    ['revenueDeltaPct', 'Variation CA HT (%)', -50, 100],
                    ['supplierDeltaPct', 'Variation charges fournisseurs (%)', -50, 100],
                    ['payrollDeltaPct', 'Variation masse salariale (%)', -50, 100],
                    ['accountingDeltaPct', 'Variation charges comptables (%)', -50, 100],
                  ] as const).map(([key, label, min, max]) => (
                    <label key={key} className="block">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{label}</span>
                        <span className="font-medium text-gray-700">{adjustments[key] ?? 0}%</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={1}
                        value={adjustments[key] ?? 0}
                        onChange={(e) => setPct(key, Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </label>
                  ))}

                  <label className="block">
                    <span className="text-xs text-gray-500">Investissement / achat d&apos;actif HT (MAD)</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={adjustments.assetPurchaseHT ?? 0}
                      onChange={(e) => setAdjustments((a) => ({ ...a, assetPurchaseHT: Number(e.target.value) }))}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Charge immédiate simplifiée + TVA déductible indicative.</p>
                  </label>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={computing}
                      onClick={() => void runCompute()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                      Calculer
                    </button>
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => void runAiProjection()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Projection IA
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-gray-800">Résultats simulés</h2>
                  {!scenario ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Ajustez les hypothèses et cliquez Calculer.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">CA HT simulé</p>
                          <p className="font-semibold">{formatMad(scenario.revenueHT)}</p>
                          <DeltaBadge value={delta?.revenueHT ?? 0} />
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Résultat fiscal</p>
                          <p className="font-semibold">{formatMad(scenario.taxableResult)}</p>
                          <DeltaBadge value={delta?.taxableResult ?? 0} />
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-lg">
                          <p className="text-xs text-indigo-600">IS dû</p>
                          <p className="font-semibold text-indigo-800">{formatMad(scenario.is.isDue)}</p>
                          <DeltaBadge value={delta?.isDue ?? 0} />
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">TVA nette</p>
                          <p className="font-semibold">{formatMad(scenario.tvaNet)}</p>
                          <DeltaBadge value={delta?.tvaNet ?? 0} />
                        </div>
                      </div>
                      {scenario.is.cotisationMinimaleAppliquee && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          Cotisation minimale IS (0,5% CA) appliquée sur ce scénario.
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Impact fiscal total (IS + TVA nette positive) :{' '}
                        <span className="font-medium">{formatMad((scenario.is.isDue + Math.max(0, scenario.tvaNet)))}</span>
                        {' '}(Δ {delta ? formatMad(delta.totalTaxBurden) : '—'})
                      </p>
                      {comparison && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveScenario()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Sauvegarder le scénario
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {projection && (
                <div className="bg-white rounded-xl border p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-indigo-600" />
                    Projection IA ({projection.provider})
                  </h2>
                  <p className="text-sm text-gray-700">{projection.summary}</p>
                  {projection.isAnalysis && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Analyse IS</p>
                      <p className="text-sm text-gray-600">{projection.isAnalysis}</p>
                    </div>
                  )}
                  {projection.tvaAnalysis && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Analyse TVA</p>
                      <p className="text-sm text-gray-600">{projection.tvaAnalysis}</p>
                    </div>
                  )}
                  {projection.recommendations.length > 0 && (
                    <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                      {projection.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {projection.risks.length > 0 && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <p className="font-medium mb-1">Points de vigilance</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {projection.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {savedScenarios.length > 0 && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-800">Scénarios sauvegardés</h2>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Nom</th>
                        <th className="px-4 py-2 text-left">IS simulé</th>
                        <th className="px-4 py-2 text-left">TVA nette</th>
                        <th className="px-4 py-2 text-left">Δ IS</th>
                        <th className="px-4 py-2 text-left">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {savedScenarios.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{s.name}</td>
                          <td className="px-4 py-2">{formatMad(s.results.is.isDue)}</td>
                          <td className="px-4 py-2">{formatMad(s.results.tvaNet)}</td>
                          <td className="px-4 py-2">
                            <DeltaBadge value={s.results.deltaVsBaseline.isDue} />
                          </td>
                          <td className="px-4 py-2 text-gray-500">
                            {new Date(s.updatedAt).toLocaleDateString('fr-MA')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[10px] text-gray-400 text-center pb-4">{EXPERT_DISCLAIMER}</p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
