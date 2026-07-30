'use client';

import { useCallback, useEffect, useState, Fragment, type ReactNode } from 'react';
import {
  Building2,
  Calculator,
  Loader2,
  Plus,
  BookOpen,
  CheckCircle2,
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
  AssetCategory,
  AtlasDepreciationSchedule,
  AtlasFixedAsset,
  FixedAssetsDashboardSummary,
  FixedAssetsPayload,
} from '@/app/types/atlas-fixed-assets';
import {
  ASSET_CATEGORY_LABELS,
  ASSET_STATUS_LABELS,
  DEFAULT_PCGE_BY_CATEGORY,
  SCHEDULE_STATUS_LABELS,
} from '@/app/types/atlas-fixed-assets';

type Tab = 'assets' | 'depreciation' | 'history';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  fully_depreciated: 'bg-gray-100 text-gray-600',
  disposed: 'bg-red-100 text-red-800',
  draft: 'bg-blue-100 text-blue-800',
  planned: 'bg-amber-100 text-amber-800',
  posted: 'bg-green-100 text-green-800',
};

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

export default function ImmobilisationsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('assets');
  const [assets, setAssets] = useState<AtlasFixedAsset[]>([]);
  const [schedules, setSchedules] = useState<AtlasDepreciationSchedule[]>([]);
  const [summary, setSummary] = useState<FixedAssetsDashboardSummary>({
    totalAssets: 0, activeAssets: 0, totalGrossValue: 0, totalAccumulatedDepreciation: 0,
    totalBookValue: 0, plannedSchedules: 0, postedSchedules: 0, realEstateCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    assetCategory: 'equipment' as AssetCategory,
    location: '',
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionCostHT: '',
    residualValue: '0',
    usefulLifeMonths: '60',
    postAcquisitionEntry: false,
  });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<FixedAssetsPayload>(
      `/api/fixed-assets?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      setAssets([]);
    } else {
      setAssets(result.data.assets ?? []);
      setSchedules(result.data.schedules ?? []);
      setSummary(result.data.summary ?? {
        totalAssets: 0, activeAssets: 0, totalGrossValue: 0, totalAccumulatedDepreciation: 0,
        totalBookValue: 0, plannedSchedules: 0, postedSchedules: 0, realEstateCount: 0,
      });
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid);
    })();
  }, [load]);

  useEffect(() => {
    return onCompanySwitched(() => {
      void (async () => {
        const cid = await getActiveCompanyDbRowId();
        setCompanyId(cid);
        if (cid) await load(cid);
      })();
    });
  }, [load]);

  const handleCreate = async () => {
    if (!companyId || !form.name.trim() || !form.acquisitionCostHT) return;
    setSubmitting(true);
    try {
      const defaults = DEFAULT_PCGE_BY_CATEGORY[form.assetCategory];
      const res = await fetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'create_asset',
          companyId,
          name: form.name,
          assetCategory: form.assetCategory,
          location: form.location || undefined,
          acquisitionDate: form.acquisitionDate,
          acquisitionCostHT: Number(form.acquisitionCostHT),
          residualValue: Number(form.residualValue),
          usefulLifeMonths: Number(form.usefulLifeMonths),
          pcgeAssetAccount: defaults.asset,
          pcgeAmortAccount: defaults.amort,
          pcgeChargeAccount: defaults.charge,
          postAcquisitionEntry: form.postAcquisitionEntry,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'create_failed');
      setShowForm(false);
      setForm({
        name: '',
        assetCategory: 'equipment',
        location: '',
        acquisitionDate: new Date().toISOString().slice(0, 10),
        acquisitionCostHT: '',
        residualValue: '0',
        usefulLifeMonths: '60',
        postAcquisitionEntry: false,
      });
      await load(companyId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur création.');
    } finally {
      setSubmitting(false);
    }
  };

  const postSchedule = async (scheduleId: string) => {
    if (!companyId) return;
    setPostingId(scheduleId);
    try {
      const res = await fetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'post_depreciation', companyId, scheduleId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'post_failed');
      await load(companyId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Comptabilisation échouée.');
    } finally {
      setPostingId(null);
    }
  };

  const postAllPlanned = async () => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'post_all', companyId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'post_all_failed');
      await load(companyId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Comptabilisation batch échouée.');
    } finally {
      setSubmitting(false);
    }
  };

  const plannedSchedules = schedules.filter((s) => s.status === 'planned');

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-indigo-600" />
                <h1 className="text-xl font-semibold text-gray-900">Immobilisations &amp; Actifs</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Registre des actifs, plan d&apos;amortissement linéaire et écritures comptables PCGE.
              </p>
            </div>
            <div className="flex gap-2">
              {plannedSchedules.length > 0 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void postAllPlanned()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  Comptabiliser tout ({plannedSchedules.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Nouvel actif
              </button>
            </div>
          </div>

          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="les immobilisations" />}
          {loadError && <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Valeur brute</p>
              <p className="text-lg font-semibold">{formatMad(summary.totalGrossValue)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Amort. cumulé</p>
              <p className="text-lg font-semibold text-amber-700">{formatMad(summary.totalAccumulatedDepreciation)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Valeur nette comptable</p>
              <p className="text-lg font-semibold text-indigo-700">{formatMad(summary.totalBookValue)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Immobilier / Actifs actifs</p>
              <p className="text-lg font-semibold">{summary.realEstateCount} / {summary.activeAssets}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === 'assets'} onClick={() => setTab('assets')}>Registre</TabButton>
            <TabButton active={tab === 'depreciation'} onClick={() => setTab('depreciation')}>
              Amortissements ({summary.plannedSchedules} planifiés)
            </TabButton>
            <TabButton active={tab === 'history'} onClick={() => setTab('history')}>Historique GL</TabButton>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : tab === 'assets' ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Actif</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3">Valeur brute</th>
                    <th className="px-4 py-3">VNC</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assets.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun actif enregistré.</td></tr>
                  ) : assets.map((a) => (
                    <Fragment key={a.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{a.assetCode}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{a.name}</span>
                          {a.location && <span className="block text-xs text-gray-400">{a.location}</span>}
                        </td>
                        <td className="px-4 py-3">{ASSET_CATEGORY_LABELS[a.assetCategory]}</td>
                        <td className="px-4 py-3">{formatMad(a.acquisitionCostHT)}</td>
                        <td className="px-4 py-3 font-medium">{formatMad(a.bookValue)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[a.status]}`}>
                            {ASSET_STATUS_LABELS[a.status]}
                          </span>
                        </td>
                      </tr>
                      {expandedId === a.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Comptes PCGE</p>
                                <p>Actif : <code className="text-indigo-700">{a.pcgeAssetAccount}</code></p>
                                <p>Amort. : <code className="text-indigo-700">{a.pcgeAmortAccount}</code></p>
                                <p>Charge : <code className="text-indigo-700">{a.pcgeChargeAccount}</code></p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Amortissement</p>
                                <p>Durée : {a.usefulLifeMonths} mois</p>
                                <p>Mensuel : {formatMad(a.monthlyDepreciation)}</p>
                                <p>Cumulé : {formatMad(a.accumulatedDepreciation)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Acquisition</p>
                                <p>Date : {new Date(`${a.acquisitionDate}T12:00:00`).toLocaleDateString('fr-MA')}</p>
                                <p>Valeur résiduelle : {formatMad(a.residualValue)}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : tab === 'depreciation' ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Période</th>
                    <th className="px-4 py-3">Actif</th>
                    <th className="px-4 py-3">Dotation</th>
                    <th className="px-4 py-3">VNC fin</th>
                    <th className="px-4 py-3">Comptes GL</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun amortissement planifié.</td></tr>
                  ) : schedules.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{s.periodKey}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{s.assetName ?? '—'}</span>
                        <span className="block text-xs text-gray-400">{s.assetCode}</span>
                      </td>
                      <td className="px-4 py-3">{formatMad(s.depreciationAmount)}</td>
                      <td className="px-4 py-3">{formatMad(s.closingNbv)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">
                        {s.pcgeChargeAccount} / {s.pcgeAmortAccount}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[s.status]}`}>
                          {SCHEDULE_STATUS_LABELS[s.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.status === 'planned' ? (
                          <button
                            type="button"
                            disabled={postingId === s.id}
                            onClick={() => void postSchedule(s.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                          >
                            {postingId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Calculator className="h-3 w-3" />
                            )}
                            Comptabiliser
                          </button>
                        ) : s.accountingEntryIds.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            {s.accountingEntryIds.length} écriture(s)
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Période</th>
                    <th className="px-4 py-3">Actif</th>
                    <th className="px-4 py-3">Montant</th>
                    <th className="px-4 py-3">Écritures comptables</th>
                    <th className="px-4 py-3">Comptabilisé le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.filter((s) => s.status === 'posted').length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucune écriture GL postée.</td></tr>
                  ) : schedules.filter((s) => s.status === 'posted').map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{s.periodKey}</td>
                      <td className="px-4 py-3">{s.assetName}</td>
                      <td className="px-4 py-3">{formatMad(s.depreciationAmount)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">
                        D {s.pcgeChargeAccount} · C {s.pcgeAmortAccount}
                        <span className="block text-gray-400 mt-0.5">
                          IDs: {s.accountingEntryIds.slice(0, 2).map((id) => id.slice(0, 8)).join(', ')}
                          {s.accountingEntryIds.length > 2 ? '…' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {s.postedAt ? new Date(s.postedAt).toLocaleString('fr-MA') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 px-4 py-3 border-t">
                Les écritures sont visibles dans Comptabilité → Journal (generated_by: fixed_assets).
              </p>
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-semibold">Enregistrer un actif</h2>
                <label className="block">
                  <span className="text-xs text-gray-500">Désignation *</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Catégorie</span>
                  <select
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.assetCategory}
                    onChange={(e) => setForm({ ...form, assetCategory: e.target.value as AssetCategory })}
                  >
                    {Object.entries(ASSET_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Localisation</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Siège, entrepôt, bureau…"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-gray-500">Date acquisition</span>
                    <input
                      type="date"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.acquisitionDate}
                      onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Prix d&apos;achat HT *</span>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.acquisitionCostHT}
                      onChange={(e) => setForm({ ...form, acquisitionCostHT: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Valeur résiduelle</span>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.residualValue}
                      onChange={(e) => setForm({ ...form, residualValue: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Durée amort. (mois)</span>
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.usefulLifeMonths}
                      onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  Comptes PCGE : {DEFAULT_PCGE_BY_CATEGORY[form.assetCategory].asset} (actif) ·{' '}
                  {DEFAULT_PCGE_BY_CATEGORY[form.assetCategory].amort} (amort.) ·{' '}
                  {DEFAULT_PCGE_BY_CATEGORY[form.assetCategory].charge} (dotation)
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.postAcquisitionEntry}
                    onChange={(e) => setForm({ ...form, postAcquisitionEntry: e.target.checked })}
                  />
                  Générer l&apos;écriture d&apos;acquisition (Actif / Banque 514100)
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg">
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !form.name.trim() || !form.acquisitionCostHT}
                    onClick={() => void handleCreate()}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50"
                  >
                    {submitting ? 'Enregistrement…' : 'Enregistrer & planifier amort.'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
