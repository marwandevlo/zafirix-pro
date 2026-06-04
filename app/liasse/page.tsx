'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle, ClipboardList, Download, FileArchive,
  Globe, Loader2, ShieldAlert,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ModuleEmptyState } from '@/app/components/onboarding/ModuleEmptyState';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { LiasseFiscaleRecord, LiasseValidationCheck } from '@/app/types/atlas-liasse';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

const CHECK_COLUMNS: ExportColumn[] = [
  { key: 'category', label: 'Catégorie' },
  { key: 'severity', label: 'Sévérité' },
  { key: 'message', label: 'Message' },
  { key: 'blocking', label: 'Bloquant' },
];

function severityClass(sev: string): string {
  if (sev === 'critical') return 'text-red-700 bg-red-50 border-red-200';
  if (sev === 'warning') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-blue-700 bg-blue-50 border-blue-200';
}

export default function LiassePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [record, setRecord] = useState<LiasseFiscaleRecord | null>(null);
  const [readiness, setReadiness] = useState<{ score: number; checks: LiasseValidationCheck[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const loadReadiness = useCallback(async (cid: string | null) => {
    const qs = new URLSearchParams({ fiscalYear: String(fiscalYear) });
    if (cid) qs.set('companyId', cid);
    const res = await apiFetch<{
      readinessScore?: number;
      checks?: LiasseValidationCheck[];
    }>(`/api/liasse/readiness?${qs}`);
    if (res.ok) {
      setReadiness({
        score: res.data.readinessScore ?? 0,
        checks: res.data.checks ?? [],
      });
    }
  }, [fiscalYear]);

  const loadRecord = useCallback(async (cid: string | null) => {
    const qs = new URLSearchParams({ fiscalYear: String(fiscalYear) });
    if (cid) qs.set('companyId', cid);
    const res = await apiFetch<{ records?: LiasseFiscaleRecord[] }>(`/api/liasse?${qs}`);
    if (res.ok) setRecord(res.data.records?.[0] ?? null);
  }, [fiscalYear]);

  useEffect(() => {
    void (async () => {
      if (!isAtlasSupabaseDataEnabled()) return;
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      await Promise.all([loadReadiness(cid), loadRecord(cid)]);
    })();
  }, [loadReadiness, loadRecord]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ record?: LiasseFiscaleRecord; error?: string }>('/api/liasse', {
        method: 'POST',
        body: JSON.stringify({ companyId, fiscalYear }),
      });
      if (!res.ok || !res.data.record) {
        setError(res.data.error ?? 'Génération impossible');
        return;
      }
      setRecord(res.data.record);
      setReadiness({
        score: res.data.record.readinessScore,
        checks: res.data.record.validationResult.checks,
      });
    } finally {
      setLoading(false);
    }
  };

  const patchStatus = async (status: 'validated' | 'filed') => {
    if (!record) return;
    setLoading(true);
    setError('');
    try {
      const body: { status: string; adminOverrideReason?: string } = { status };
      if (showOverride && overrideReason.trim().length >= 10) {
        body.adminOverrideReason = overrideReason.trim();
      }
      const res = await apiFetch<{ record?: LiasseFiscaleRecord; error?: string; message?: string }>(
        `/api/liasse/${record.id}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      if (!res.ok) {
        setError(res.data.message ?? res.data.error ?? 'Transition refusée');
        setShowOverride(true);
        return;
      }
      if (res.data.record) setRecord(res.data.record);
      setShowOverride(false);
    } finally {
      setLoading(false);
    }
  };

  const downloadAuditPackage = () => {
    if (!record) return;
    window.open(`/api/liasse/${record.id}/audit-package?download=1`, '_blank');
  };

  const score = record?.readinessScore ?? readiness?.score ?? 0;
  const checks = record?.validationResult.checks ?? readiness?.checks ?? [];
  const blocking = record?.blockingIssues ?? checks.filter((c) => c.blocking);

  const exportChecks = useMemo(
    () => checks.map((c) => ({
      category: c.category,
      severity: c.severity,
      message: c.message,
      blocking: c.blocking ? 'oui' : 'non',
    })),
    [checks],
  );

  const bank = record?.payload?.bank_summary as Record<string, unknown> | undefined;
  const payroll = record?.payload?.payroll_summary as Record<string, unknown> | undefined;

  if (!isAtlasSupabaseDataEnabled()) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-500">Supabase requis pour la liasse fiscale.</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800">Liasse Fiscale</h1>
              <BetaSurfaceBadge />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Intégration banque (Phase 11) · paie CNSS/IR · TVA · bilan · package audit
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {record && (
              <>
                <ExportMenu
                  data={exportChecks}
                  columns={CHECK_COLUMNS}
                  filename={`liasse-checks-${fiscalYear}`}
                  title={`Contrôles liasse ${fiscalYear}`}
                  formats={['csv', 'xlsx', 'json']}
                  size="sm"
                />
                <button
                  type="button"
                  onClick={downloadAuditPackage}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm"
                >
                  <Download size={14} /> Package audit
                </button>
              </>
            )}
            <button type="button" onClick={() => window.open('https://www.tax.gov.ma', '_blank')} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-600">
              <Globe size={14} /> DGI
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl p-6 shadow-sm border flex flex-wrap gap-6 items-end">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Exercice</label>
              <select
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="px-3 py-2 text-sm border rounded-lg"
              >
                {[2026, 2025, 2024].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2A4A] text-white rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />}
              Générer / actualiser la liasse
            </button>
            {record && (
              <span className="text-xs text-gray-500">
                Statut: <strong>{record.status}</strong>
                {record.adminOverrideReason && ' · override admin'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-6 border shadow-sm md:col-span-1">
              <p className="text-sm text-gray-500 mb-2">Prêt pour clôture fiscale</p>
              <p className={`text-4xl font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {score}%
              </p>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, score)}%` }}
                />
              </div>
              {blocking.length > 0 && (
                <p className="text-xs text-red-600 mt-2">{blocking.length} point(s) bloquant(s)</p>
              )}
            </div>

            <div className="bg-white rounded-xl p-6 border shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Banque (Phase 11)</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>Transactions: {String((bank as { transactions_count?: number })?.transactions_count ?? '—')}</li>
                <li>Non rapprochées: {String((bank as { unreconciled_count?: number })?.unreconciled_count ?? '—')}</li>
                <li>Solde comptable 512: {String((bank as { accounting_bank_balance?: number })?.accounting_bank_balance ?? '—')} MAD</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Paie CNSS / IR</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>Brut: {String(payroll?.gross_salaries ?? '—')} MAD</li>
                <li>CNSS: {String(payroll?.cnss_deductions ?? '—')} MAD</li>
                <li>IR retenu: {String(payroll?.ir_retained ?? '—')} MAD</li>
                <li>Bulletins validés: {String(payroll?.payslips_validated ?? 0)} / {String(payroll?.payslips_total ?? 0)}</li>
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                <ClipboardList size={14} /> Contrôles de validation
              </h2>
              <span className="text-xs text-gray-400">{checks.length} contrôle(s)</span>
            </div>
            <div className="divide-y max-h-80 overflow-y-auto">
              {checks.length === 0 && (
                <div className="px-4 py-2">
                  <ModuleEmptyState module="liasse" />
                </div>
              )}
              {checks.map((c) => (
                <div key={c.id} className={`px-4 py-3 text-sm border-l-4 ${severityClass(c.severity)}`}>
                  <div className="flex items-center gap-2">
                    {c.blocking ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                    <span className="font-medium">{c.category}</span>
                    <span className="text-xs opacity-70">{c.severity}</span>
                  </div>
                  <p className="mt-1">{c.message}</p>
                </div>
              ))}
            </div>
          </div>

          {record && (
            <div className="bg-white rounded-xl p-6 border shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-700">Validation & dépôt</h3>
              {showOverride && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Motif override admin (≥ 10 car.)</label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Justification pour outrepasser les blocages critiques…"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={loading || record.status === 'validated' || record.status === 'filed'}
                  onClick={() => void patchStatus('validated')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  Valider la liasse
                </button>
                <button
                  type="button"
                  disabled={loading || record.status === 'filed'}
                  onClick={() => void patchStatus('filed')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  Marquer comme déposée
                </button>
                {blocking.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOverride((v) => !v)}
                    className="px-4 py-2 border border-amber-300 text-amber-800 rounded-lg text-sm"
                  >
                    Override admin
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
