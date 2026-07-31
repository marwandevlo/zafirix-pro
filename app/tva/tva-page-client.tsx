'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileCode,
  FileSpreadsheet,
  Globe,
  History,
  Loader2,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ModuleEmptyState } from '@/app/components/onboarding/ModuleEmptyState';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { EntityAuditTable } from '@/app/components/history/EntityAuditTable';
import { RowActions } from '@/app/components/actions';
import { isValidIce } from '@/app/lib/atlas-morocco-compliance';
import GlobalTable from '@/app/components/data-grid/GlobalTable';
import type { GlobalTableColumn, GlobalTableRow } from '@/app/components/data-grid/GlobalTable';
import {
  filterRowsBySelectedIds,
  normalizeGlobalTableRows,
  pruneSelectedIds,
  runOptimisticBulkDelete,
} from '@/app/components/data-grid/global-table-id';
import { exportTable } from '@/app/lib/atlas-table-export';
import { openWhatsAppShare } from '@/app/lib/atlas-quick-share';
import type { AtlasTvaLineItem } from '@/app/types/atlas-tva';

const TVA_LINE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'reference', label: 'Référence' },
  { key: 'counterparty', label: 'Tiers' },
  { key: 'issueDate', label: 'Date' },
  { key: 'amountHT', label: 'Montant HT (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
  { key: 'vatAmount', label: 'TVA (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
  { key: 'totalTTC', label: 'TTC (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
  { key: 'source', label: 'Source' },
  { key: 'source_document_id', label: 'Source Document IA' },
];
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { readActiveCompanyFromLocalStorage } from '@/app/lib/atlas-companies-repository';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { dgiDeclarationRegime, generateTvaDeclarationXml } from '@/app/lib/atlas-tva-xml';
import type { AtlasTvaDashboard, AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';

type Tab = 'dashboard' | 'ventes' | 'achats' | 'historique' | 'audit';

type TvaQuarterSelection = 'T1' | 'T2' | 'T3' | 'T4' | 'AN';

const TVA_YEARS = [2024, 2025, 2026, 2027] as const;

const QUARTER_OPTIONS: { value: TvaQuarterSelection; label: string }[] = [
  { value: 'T1', label: 'Trimestre 1 (Jan – Mar)' },
  { value: 'T2', label: 'Trimestre 2 (Avr – Jun)' },
  { value: 'T3', label: 'Trimestre 3 (Jul – Sep)' },
  { value: 'T4', label: 'Trimestre 4 (Oct – Déc)' },
  { value: 'AN', label: 'Annuel' },
];

function currentQuarter(): TvaQuarterSelection {
  const q = Math.ceil((new Date().getMonth() + 1) / 3);
  return `T${q}` as TvaQuarterSelection;
}

function buildPeriodKey(year: number, quarter: TvaQuarterSelection): string {
  if (quarter === 'AN') return `${year}-AN`;
  return `${year}-Q${quarter.slice(1)}`;
}

function parsePeriodKey(key: string): { year: number; quarter: TvaQuarterSelection } | null {
  const annual = key.match(/^(\d{4})-AN$/);
  if (annual) return { year: Number(annual[1]), quarter: 'AN' };
  const quarterly = key.match(/^(\d{4})-Q([1-4])$/);
  if (quarterly) return { year: Number(quarterly[1]), quarter: `T${quarterly[2]}` as TvaQuarterSelection };
  return null;
}

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

const TVA_HISTORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'periodLabel', label: 'Période' },
  { key: 'tvaCollectee', label: 'TVA collectée', format: v => typeof v === 'number' ? v.toFixed(2) : '' },
  { key: 'tvaDeductible', label: 'TVA déductible', format: v => typeof v === 'number' ? v.toFixed(2) : '' },
  { key: 'tvaNette', label: 'TVA nette', format: v => typeof v === 'number' ? v.toFixed(2) : '' },
  { key: 'declarationDueDate', label: 'Échéance' },
  { key: 'status', label: 'Statut' },
];

async function deleteTvaSourceLine(line: AtlasTvaPeriodRecord['lines'][number]): Promise<boolean> {
  if (line.source === 'tva_suggestion') return false;
  const path =
    line.source === 'supplier_invoice' ? `/api/supplier-invoices/${line.id}` :
    line.source === 'invoice' ? `/api/invoices/${line.id}` :
    line.source === 'accounting_entry' ? `/api/accounting/entries/${line.id}` :
    null;
  if (!path) return false;
  const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
  return res.ok;
}

async function updateTvaSourceLine(line: AtlasTvaPeriodRecord['lines'][number], values: Record<string, string>): Promise<boolean> {
  if (line.source === 'supplier_invoice') {
    const res = await fetch(`/api/supplier-invoices/${line.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceNumber: values.reference,
        supplierName: values.counterparty,
        issueDate: values.issueDate,
        amountHT: parseFloat(values.amountHT) || 0,
        vatAmount: parseFloat(values.vatAmount) || 0,
        totalTTC: parseFloat(values.totalTTC) || 0,
        supplierIce: values.supplierIce,
      }),
    });
    return res.ok;
  }
  if (line.source === 'accounting_entry') {
    const res = await fetch(`/api/accounting/entries/${line.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        libelle: `${values.counterparty} — ${values.reference}`,
        date: values.issueDate,
        debit: parseFloat(values.vatAmount) || 0,
      }),
    });
    return res.ok;
  }
  return false;
}

type TvaHistoryTableRow = GlobalTableRow & {
  periodLabel: string;
  tvaCollectee: number;
  tvaDeductible: number;
  tvaNette: number;
  declarationDueDate: string;
  status: string;
};

export default function TvaPageClient() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AtlasTvaDashboard | null>(null);
  const [history, setHistory] = useState<AtlasTvaPeriodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declaring, setDeclaring] = useState(false);
  const [xmlDone, setXmlDone] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<TvaQuarterSelection>(() => currentQuarter());
  const skipPeriodFetchRef = useRef(false);
  const initialDetectDoneRef = useRef(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);

  const supabaseEnabled = isAtlasSupabaseDataEnabled();

  const reload = useCallback(
    async (opts?: { detectLatest?: boolean; periodKey?: string }) => {
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

        const dashParams = new URLSearchParams({ companyId: cid });
        const historyParams = new URLSearchParams({ companyId: cid, year: String(selectedYear) });

        if (opts?.detectLatest) {
          dashParams.set('detectLatest', '1');
          dashParams.set('year', String(selectedYear));
        } else {
          const periodKey = opts?.periodKey ?? buildPeriodKey(selectedYear, selectedQuarter);
          dashParams.set('periodKey', periodKey);
        }

        const [dashRes, histRes] = await Promise.all([
          tvaFetch<{ dashboard?: AtlasTvaDashboard; error?: string }>(
            `/api/tva/dashboard?${dashParams.toString()}`,
          ),
          tvaFetch<{ periods?: AtlasTvaPeriodRecord[]; error?: string }>(
            `/api/tva/history?${historyParams.toString()}`,
          ),
        ]);

        if (!dashRes.ok) {
          setError(dashRes.data.error ?? 'Impossible de charger la TVA.');
          setDashboard(null);
        } else {
          const dash = dashRes.data.dashboard ?? null;
          setDashboard(dash);
          if (opts?.detectLatest && dash?.selectedPeriodKey) {
            const parsed = parsePeriodKey(dash.selectedPeriodKey);
            if (parsed) {
              skipPeriodFetchRef.current = true;
              setSelectedYear(parsed.year);
              setSelectedQuarter(parsed.quarter);
            }
          }
        }
        if (histRes.ok) {
          setHistory(histRes.data.periods ?? []);
        }
      } catch {
        setError('Erreur réseau.');
      } finally {
        setLoading(false);
      }
    },
    [supabaseEnabled, selectedYear, selectedQuarter],
  );

  useEffect(() => {
    if (!initialDetectDoneRef.current) {
      initialDetectDoneRef.current = true;
      void reload({ detectLatest: true });
      return;
    }
    if (skipPeriodFetchRef.current) {
      skipPeriodFetchRef.current = false;
      return;
    }
    void reload();
  }, [selectedYear, selectedQuarter, reload]);

  const current = dashboard?.current ?? null;
  const salesLines = useMemo(
    () => (current?.lines ?? []).filter((l) => l.kind === 'sale'),
    [current],
  );
  const purchaseLines = useMemo(
    () => (current?.lines ?? []).filter((l) => l.kind === 'purchase'),
    [current],
  );

  const historyTableRows = useMemo(
    (): TvaHistoryTableRow[] =>
      normalizeGlobalTableRows(
        history.map((p) => ({
          id: p.id,
          periodLabel: p.periodLabel,
          tvaCollectee: p.tvaCollectee,
          tvaDeductible: p.tvaDeductible,
          tvaNette: p.tvaNette,
          declarationDueDate: p.declarationDueDate,
          status: p.status,
        })) as Record<string, unknown>[],
      ) as TvaHistoryTableRow[],
    [history],
  );

  useEffect(() => {
    setSelectedHistoryIds((prev) => pruneSelectedIds(prev, historyTableRows));
  }, [historyTableRows]);

  const downloadXml = () => {
    if (!current || !dashboard) return;
    const activeCompany = readActiveCompanyFromLocalStorage();
    const identifiantFiscal =
      activeCompany?.if_fiscal?.trim() ||
      (activeCompany as { if_number?: string } | null)?.if_number?.trim() ||
      '';
    const xml = generateTvaDeclarationXml(current, {
      identifiantFiscal,
      regime: dgiDeclarationRegime(),
    });
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TVA_${current.periodKey}_DGI.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setXmlDone(true);
  };

  const downloadExcel = async () => {
    if (!current || !companyId) return;
    setExportingExcel(true);
    setError('');
    try {
      const periodKey = buildPeriodKey(selectedYear, selectedQuarter);
      const params = new URLSearchParams({ companyId, periodKey });
      const res = await fetch(`/api/tva/export?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Export Excel impossible.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Releve_TVA_${periodKey}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur réseau lors de l\'export Excel.');
    } finally {
      setExportingExcel(false);
    }
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
    { id: 'audit', label: 'Activité IA', icon: History },
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="tva-year" className="text-xs text-gray-500">
                Année
              </label>
              <select
                id="tva-year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                disabled={loading}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 min-w-[5.5rem]"
              >
                {TVA_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="tva-quarter" className="text-xs text-gray-500">
                Période
              </label>
              <select
                id="tva-quarter"
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value as TvaQuarterSelection)}
                disabled={loading}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 min-w-[14rem]"
              >
                {QUARTER_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void downloadExcel()}
              disabled={!current || !companyId || exportingExcel}
              className="flex items-center gap-2 px-4 py-2 bg-[#1F497D] text-white rounded-lg text-sm hover:bg-[#16365c] transition-colors disabled:opacity-50"
            >
              {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              Exporter Excel DGI
            </button>
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
                  <p className="text-xs text-gray-400">Période sélectionnée</p>
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
                    <li>Écritures comptables 4455 / 4456 / 3455</li>
                    <li>Suggestions TVA (Documents IA)</li>
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
            <InvoiceTable title="Factures ventes (TVA collectée)" lines={salesLines} counterpartyLabel="Client" onRefresh={() => void reload()} />
          )}

          {!loading && current && tab === 'achats' && (
            <InvoiceTable title="Factures achats (TVA déductible)" lines={purchaseLines} counterpartyLabel="Fournisseur" onRefresh={() => void reload()} />
          )}

          {!loading && tab === 'audit' && (
            <EntityAuditTable entityType="tva_suggestion" title="Activité IA — Suggestions TVA" />
          )}

          {!loading && tab === 'historique' && (
            <TvaHistoryTable
              rows={historyTableRows}
              history={history}
              selectedIds={selectedHistoryIds}
              onSelectionChange={setSelectedHistoryIds}
            />
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
  onRefresh,
}: {
  title: string;
  lines: AtlasTvaPeriodRecord['lines'];
  counterpartyLabel: string;
  onRefresh?: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setHiddenIds(new Set());
  }, [lines]);

  const visibleLines = useMemo(
    () => lines.filter((line) => !hiddenIds.has(line.id)),
    [hiddenIds, lines],
  );

  const tableRows = useMemo(
    () => normalizeGlobalTableRows(visibleLines as unknown as Record<string, unknown>[]) as (AtlasTvaLineItem & GlobalTableRow)[],
    [visibleLines],
  );

  useEffect(() => {
    setSelectedIds((prev) => pruneSelectedIds(prev, tableRows));
  }, [tableRows]);

  const lineById = useMemo(() => new Map(tableRows.map((row) => [row.id, row])), [tableRows]);

  const columns = useMemo((): GlobalTableColumn<(typeof tableRows)[number]>[] => [
    { header: 'Réf.', accessor: 'reference', render: (row) => row.reference || '—' },
    { header: counterpartyLabel, accessor: 'counterparty' },
    { header: 'Date', accessor: 'issueDate' },
    { header: 'HT', accessor: 'amountHT', className: 'text-right', render: (row) => formatMad(row.amountHT) },
    { header: 'TVA', accessor: 'vatAmount', className: 'text-right', render: (row) => formatMad(row.vatAmount) },
    { header: 'TTC', accessor: 'totalTTC', className: 'text-right', render: (row) => formatMad(row.totalTTC) },
    { header: 'Source', accessor: 'source', render: (row) => <span className="text-xs text-gray-400">{row.source}</span> },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'text-right',
      render: (row) => {
        const f = lineById.get(row.id);
        if (!f) return null;
        return (
          <div className="relative inline-flex justify-end">
            <RowActions
              entityId={f.id}
              entityLabel={f.reference || f.counterparty}
              entityType="ligne TVA"
              exportData={{
                id: f.id,
                reference: f.reference,
                counterparty: f.counterparty,
                issueDate: f.issueDate,
                amountHT: f.amountHT,
                vatAmount: f.vatAmount,
                totalTTC: f.totalTTC,
                source: f.source,
              }}
              exportColumns={TVA_LINE_EXPORT_COLUMNS}
              exportFilename="ligne_tva"
              exportTitle={title}
              hideEdit={f.source === 'tva_suggestion' || f.source === 'invoice'}
              hideDelete={f.source === 'tva_suggestion'}
              editFields={[
                { key: 'reference', label: 'Référence', value: f.reference ?? '' },
                { key: 'counterparty', label: counterpartyLabel, value: f.counterparty ?? '', required: true },
                { key: 'issueDate', label: 'Date', type: 'date', value: f.issueDate ?? '' },
                { key: 'amountHT', label: 'HT (MAD)', type: 'number', value: String(f.amountHT) },
                { key: 'vatAmount', label: 'TVA (MAD)', type: 'number', value: String(f.vatAmount) },
                { key: 'totalTTC', label: 'TTC (MAD)', type: 'number', value: String(f.totalTTC) },
                ...(counterpartyLabel === 'Fournisseur'
                  ? [{
                      key: 'supplierIce',
                      label: 'ICE',
                      value: f.supplierIce ?? '',
                      validate: (v: string) => (!v.trim() || isValidIce(v) ? null : 'ICE invalide (15 chiffres)'),
                    }]
                  : []),
              ]}
              onEditSave={async (values) => {
                const ok = await updateTvaSourceLine(f, values);
                if (ok) onRefresh?.();
                return ok;
              }}
              onDelete={async () => {
                const ok = await deleteTvaSourceLine(f);
                if (ok) onRefresh?.();
                return ok;
              }}
            />
          </div>
        );
      },
    },
  ], [counterpartyLabel, lineById, onRefresh, title]);

  const handleBulkShare = (ids: string[]) => {
    const selected = filterRowsBySelectedIds(tableRows as unknown as Record<string, unknown>[], ids) as typeof tableRows;
    const summary = selected
      .map((row) => `- ${row.reference || row.counterparty}: ${formatMad(row.vatAmount)} TVA`)
      .join('\n');
    openWhatsAppShare(`${title} — sélection:\n${summary}`);
  };

  const handleBulkDownload = (ids: string[]) => {
    const selected = filterRowsBySelectedIds(tableRows as unknown as Record<string, unknown>[], ids);
    void exportTable(
      'xlsx',
      selected,
      TVA_LINE_EXPORT_COLUMNS,
      `tva_${counterpartyLabel.toLowerCase()}`,
      { title },
    );
  };

  const handleBulkDelete = (ids: string[]) => {
    runOptimisticBulkDelete({
      ids,
      confirmMessage: `Supprimer ${ids.length} ligne(s) TVA ?`,
      onOptimistic: () => {
        setHiddenIds((prev) => new Set([...prev, ...ids]));
        setSelectedIds([]);
      },
      onPersist: async (deleteIds) => {
        for (const id of deleteIds) {
          const line = lineById.get(id);
          if (line) await deleteTvaSourceLine(line);
        }
      },
      onPersistError: () => {
        onRefresh?.();
      },
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{visibleLines.length} ligne(s)</p>
        </div>
        <ExportMenu
          data={tableRows as unknown as Record<string, unknown>[]}
          columns={TVA_LINE_EXPORT_COLUMNS}
          filename={`tva_${counterpartyLabel.toLowerCase()}`}
          title={title}
          selectedIds={selectedIds.length > 0 ? new Set(selectedIds) : undefined}
          size="xs"
          align="right"
        />
      </div>

      {visibleLines.length === 0 ? (
        <ModuleEmptyState module="tva" />
      ) : (
        <div className="p-4">
          <GlobalTable
            columns={columns}
            data={tableRows}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onModify={(ids) => window.alert(`Modification groupée de ${ids.length} ligne(s) — bientôt disponible.`)}
            onShare={handleBulkShare}
            onDownload={handleBulkDownload}
            onDelete={(ids) => void handleBulkDelete(ids)}
            hideRowActions
            clearSelectionOnDelete={false}
          />
        </div>
      )}
    </div>
  );
}

function TvaHistoryTable({
  rows,
  history,
  selectedIds,
  onSelectionChange,
}: {
  rows: TvaHistoryTableRow[];
  history: AtlasTvaPeriodRecord[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const periodById = useMemo(() => new Map(history.map((p) => [p.id, p])), [history]);

  const columns = useMemo((): GlobalTableColumn<TvaHistoryTableRow>[] => [
    { header: 'Période', accessor: 'periodLabel' },
    { header: 'Collectée', accessor: 'tvaCollectee', className: 'text-right', render: (row) => <span className="text-blue-600">{formatMad(row.tvaCollectee)}</span> },
    { header: 'Déductible', accessor: 'tvaDeductible', className: 'text-right', render: (row) => <span className="text-green-600">{formatMad(row.tvaDeductible)}</span> },
    { header: 'Nette', accessor: 'tvaNette', className: 'text-right', render: (row) => formatMad(row.tvaNette) },
    { header: 'Échéance', accessor: 'declarationDueDate' },
    { header: 'Statut', accessor: 'status', render: (row) => statusBadge(row.status) },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'text-right',
      render: (row) => {
        const p = periodById.get(row.id);
        if (!p) return null;
        return (
          <div className="relative inline-flex justify-end">
            <RowActions
              entityId={p.id}
              entityLabel={p.periodLabel}
              entityType="période TVA"
              exportData={{
                id: p.id,
                periodLabel: p.periodLabel,
                tvaCollectee: p.tvaCollectee,
                tvaDeductible: p.tvaDeductible,
                tvaNette: p.tvaNette,
                declarationDueDate: p.declarationDueDate,
                status: p.status,
              }}
              exportColumns={TVA_HISTORY_EXPORT_COLUMNS}
              exportFilename="periode_tva"
              hideEdit
              hideDelete
            />
          </div>
        );
      },
    },
  ], [periodById]);

  const handleBulkDownload = (ids: string[]) => {
    const selected = filterRowsBySelectedIds(rows as unknown as Record<string, unknown>[], ids);
    void exportTable('xlsx', selected, TVA_HISTORY_EXPORT_COLUMNS, 'historique_tva', { title: 'Historique TVA' });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">Historique TVA</h2>
          <p className="text-xs text-gray-400 mt-0.5">Périodes trimestrielles et annuelles</p>
        </div>
        <ExportMenu
          data={rows as unknown as Record<string, unknown>[]}
          columns={TVA_HISTORY_EXPORT_COLUMNS}
          filename="historique_tva"
          title="Historique TVA"
          selectedIds={selectedIds.length > 0 ? new Set(selectedIds) : undefined}
          size="xs"
          align="right"
        />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">Aucune période enregistrée.</p>
      ) : (
        <div className="p-4">
          <GlobalTable
            columns={columns}
            data={rows}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            onShare={(ids) => {
              const selected = filterRowsBySelectedIds(rows as unknown as Record<string, unknown>[], ids) as TvaHistoryTableRow[];
              const summary = selected.map((row) => `- ${row.periodLabel}: ${formatMad(row.tvaNette)} net`).join('\n');
              openWhatsAppShare(`Historique TVA:\n${summary}`);
            }}
            onDownload={handleBulkDownload}
            hideRowActions
          />
        </div>
      )}
    </div>
  );
}
