'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Calculator,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { ValidationQueueTable } from '@/app/components/validation/ValidationQueueTable';
import { ValidationKpiCards } from '@/app/components/validation/ValidationKpiCards';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { downloadCsvReport, downloadPdfReport } from '@/app/lib/atlas-reports-export';
import type {
  AtlasReportPeriodPreset,
  AtlasReportPayload,
  AtlasReportType,
  AtlasReportsDashboard,
} from '@/app/types/atlas-reports';

const REPORT_META: {
  type: AtlasReportType;
  label: string;
  desc: string;
  icon: typeof Receipt;
  color: string;
}[] = [
  { type: 'commercial', label: 'Commercial', desc: "CA, factures, encaissements, évolution", icon: TrendingUp, color: 'bg-blue-500' },
  { type: 'comptable', label: 'Comptable', desc: 'Écritures par compte', icon: Calculator, color: 'bg-cyan-600' },
  { type: 'fiscal', label: 'Fiscal', desc: 'Synthèse fiscale et TVA', icon: Receipt, color: 'bg-purple-500' },
  { type: 'fournisseurs', label: 'Fournisseurs', desc: 'Dépenses et factures achats', icon: FileText, color: 'bg-amber-500' },
  { type: 'clients', label: 'Clients', desc: 'Activité et répertoire clients', icon: Users, color: 'bg-green-500' },
  { type: 'tva', label: 'TVA', desc: 'Périodes TVA et net à payer', icon: BarChart3, color: 'bg-indigo-500' },
  { type: 'is', label: 'Déclaration IS', desc: 'Résultat fiscal et IS dû (brouillons)', icon: Calculator, color: 'bg-purple-600' },
  { type: 'cnss', label: 'Bordereau CNSS', desc: 'Paie, cotisations et IR par période', icon: Users, color: 'bg-green-600' },
  { type: 'bilan', label: 'Bilan simplifié', desc: 'Actif, passif et résultat (écritures)', icon: TrendingUp, color: 'bg-amber-600' },
];

async function reportsFetch<T>(path: string): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, { credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, data };
}

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function periodQuery(
  companyId: string,
  preset: AtlasReportPeriodPreset,
  customFrom: string,
  customTo: string,
): string {
  const base = `companyId=${encodeURIComponent(companyId)}&preset=${preset}`;
  if (preset === 'custom' && customFrom && customTo) {
    return `${base}&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`;
  }
  return base;
}

type ValidationStatusFilter = 'all' | 'draft' | 'reviewed' | 'validated' | 'rejected';

const VALIDATION_FILTER_OPTS: { value: ValidationStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'reviewed', label: 'Révisés' },
  { value: 'validated', label: 'Validés' },
  { value: 'rejected', label: 'Rejetés' },
];

export default function RapportsPage() {
  const supabaseEnabled = isAtlasSupabaseDataEnabled();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AtlasReportsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<AtlasReportPeriodPreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [validationFilter, setValidationFilter] = useState<ValidationStatusFilter>('all');

  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (!supabaseEnabled || !cid) {
        setDashboard(null);
        return;
      }
      const q = periodQuery(cid, preset, customFrom, customTo);
      const { ok, data } = await reportsFetch<{ dashboard?: AtlasReportsDashboard; error?: string }>(
        `/api/reports/dashboard?${q}`,
      );
      if (!ok) {
        setError(data.error ?? 'Impossible de charger les rapports.');
        setDashboard(null);
      } else {
        setDashboard(data.dashboard ?? null);
      }
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }, [supabaseEnabled, preset, customFrom, customTo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const maxCa = useMemo(
    () => Math.max(...(dashboard?.monthlyEvolution.map((p) => p.ca) ?? [1]), 1),
    [dashboard],
  );

  const exportReport = async (type: AtlasReportType, format: 'pdf' | 'csv') => {
    if (!companyId) return;
    setExporting(`${type}-${format}`);
    try {
      const q = periodQuery(companyId, preset, customFrom, customTo);
      const { ok, data } = await reportsFetch<{ report?: AtlasReportPayload; error?: string }>(
        `/api/reports/${type}?${q}`,
      );
      if (!ok || !data.report) {
        setError(data.error ?? 'Export impossible.');
        return;
      }
      if (format === 'pdf') {
        await downloadPdfReport(data.report);
      } else {
        downloadCsvReport(data.report);
      }
    } finally {
      setExporting(null);
    }
  };

  if (!supabaseEnabled) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-3">
            <AlertCircle className="mx-auto text-amber-600" size={32} />
            <h1 className="text-lg font-semibold text-gray-800">Rapports — Supabase requis</h1>
            <p className="text-sm text-gray-500">
              Les rapports utilisent uniquement les données persistées en production (Supabase).
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Rapports</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {dashboard?.companyName ?? '—'} · Données réelles · {dashboard?.period.periodLabel ?? ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as AtlasReportPeriodPreset)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              >
                <option value="month">Mois en cours</option>
                <option value="quarter">Trimestre en cours</option>
                <option value="year">Année en cours</option>
                <option value="custom">Période personnalisée</option>
              </select>
              {preset === 'custom' && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => void reload()}
                className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Actualiser
              </button>
            </div>
          </div>
        </header>

        {/* Validation status filter chips */}
        <div className="bg-white border-b border-gray-100 px-8 py-3 shrink-0 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-400 mr-1">Statut Documents IA :</span>
          {VALIDATION_FILTER_OPTS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValidationFilter(opt.value)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                validationFilter === opt.value
                  ? opt.value === 'draft' ? 'bg-amber-500 text-white border-amber-500'
                    : opt.value === 'reviewed' ? 'bg-purple-600 text-white border-purple-600'
                    : opt.value === 'validated' ? 'bg-green-600 text-white border-green-600'
                    : opt.value === 'rejected' ? 'bg-red-600 text-white border-red-600'
                    : 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <a href="/validation" className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-medium border border-rose-200 px-2.5 py-1 rounded-full hover:bg-rose-50">
            Centre de validation →
          </a>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

          {/* Validation KPIs — shown when filtering by status */}
          {validationFilter !== 'all' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-700">Métriques de validation Documents IA</h2>
              <ValidationKpiCards />
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">File d'attente par module</h3>
                <ValidationQueueTable />
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="animate-spin" size={20} />
              Chargement des rapports…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {!loading && !companyId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Sélectionnez une société active pour générer les rapports.
            </div>
          )}

          {!loading && dashboard && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Chiffre d'affaires", value: formatMad(dashboard.kpis.chiffreAffaires), color: 'text-blue-600' },
                  { label: 'Factures émises', value: String(dashboard.kpis.facturesEmises), color: 'text-gray-800' },
                  {
                    label: 'Factures impayées',
                    value: `${dashboard.kpis.facturesImpayees} (${formatMad(dashboard.kpis.facturesImpayeesMontant)})`,
                    color: 'text-amber-700',
                  },
                  { label: 'Encaissements', value: formatMad(dashboard.kpis.encaissements), color: 'text-green-600' },
                  { label: 'Dépenses fournisseurs', value: formatMad(dashboard.kpis.depensesFournisseurs), color: 'text-red-600' },
                  { label: 'TVA nette', value: formatMad(dashboard.kpis.tvaNette), color: 'text-purple-600' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-400">{kpi.label}</p>
                    <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-blue-500" />
                  Évolution mensuelle — CA HT
                </h2>
                {dashboard.monthlyEvolution.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune donnée sur la période.</p>
                ) : (
                  <div className="flex items-end gap-2 h-40">
                    {dashboard.monthlyEvolution.map((p) => (
                      <div key={p.monthKey} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <div
                          className="w-full bg-blue-500 rounded-t transition-all"
                          style={{ height: `${Math.max(4, (p.ca / maxCa) * 120)}px` }}
                          title={`${p.label}: ${formatMad(p.ca)}`}
                        />
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">{p.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {REPORT_META.map((r) => (
                  <div
                    key={r.type}
                    className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 ${r.color} rounded-xl flex items-center justify-center shrink-0`}>
                        <r.icon size={22} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <h2 className="font-bold text-gray-800">{r.label}</h2>
                        <p className="text-sm text-gray-400 mt-1">{r.desc}</p>
                        <p className="text-xs text-blue-500 mt-1 font-medium">
                          Période: {dashboard.period.periodLabel}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void exportReport(r.type, 'pdf')}
                        disabled={exporting === `${r.type}-pdf`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#243660] disabled:opacity-50"
                      >
                        {exporting === `${r.type}-pdf` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportReport(r.type, 'csv')}
                        disabled={exporting === `${r.type}-csv`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        {exporting === `${r.type}-csv` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <FileSpreadsheet size={14} />
                        )}
                        CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
