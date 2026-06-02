'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FileCheck, Loader2, AlertTriangle, CheckCircle, Download,
  Shield, Landmark, Users, Receipt,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';
import type { LiasseCheck, LiasseFiscalePayload } from '@/app/types/atlas-liasse';

type LiasseRecord = {
  id: string;
  status: string;
  readiness_score: number;
  payload: LiasseFiscalePayload;
  admin_override_reason?: string | null;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

function severityClass(sev: string): string {
  if (sev === 'critical') return 'bg-red-50 border-red-200 text-red-800';
  if (sev === 'warning') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-blue-50 border-blue-200 text-blue-800';
}

export default function LiassePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [record, setRecord] = useState<LiasseRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const load = useCallback(async (cid: string, year: number) => {
    const res = await apiFetch<{ record?: LiasseRecord | null }>(
      `/api/liasse?companyId=${encodeURIComponent(cid)}&fiscalYear=${year}`,
    );
    if (res.ok) setRecord(res.data.record ?? null);
  }, []);

  useEffect(() => {
    void (async () => {
      if (!isAtlasSupabaseDataEnabled()) return;
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid, fiscalYear);
    })();
  }, [load, fiscalYear]);

  const generate = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ payload?: LiasseFiscalePayload; id?: string; error?: string }>(
        '/api/liasse',
        { method: 'POST', body: JSON.stringify({ companyId, fiscalYear }) },
      );
      if (!res.ok || !res.data.payload) {
        setError(res.data.error ?? 'Génération impossible');
        return;
      }
      await load(companyId, fiscalYear);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (status: 'validated' | 'filed') => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ error?: string; blockers?: LiasseCheck[] }>(
        '/api/liasse',
        {
          method: 'PATCH',
          body: JSON.stringify({
            companyId,
            fiscalYear,
            status,
            adminOverrideReason: showOverride ? overrideReason : undefined,
          }),
        },
      );
      if (!res.ok) {
        const blockers = res.data.blockers ?? [];
        setError(
          res.data.error
            ?? `${blockers.length} point(s) bloquant(s)`,
        );
        if (blockers.length) setShowOverride(true);
        return;
      }
      await load(companyId, fiscalYear);
      setShowOverride(false);
    } finally {
      setLoading(false);
    }
  };

  const downloadAudit = () => {
    if (!companyId) return;
    window.open(
      `/api/liasse/audit-package?companyId=${encodeURIComponent(companyId)}&fiscalYear=${fiscalYear}&download=1`,
      '_blank',
    );
  };

  const payload = record?.payload;
  const score = payload?.readiness_score ?? record?.readiness_score ?? 0;
  const checks = payload?.checks ?? [];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 p-4 lg:p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck className="text-violet-600" size={22} />
              <h1 className="text-xl font-bold text-gray-900">Liasse fiscale</h1>
              <BetaSurfaceBadge />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Clôture fiscale — banque (Phase 11), paie, CNSS, IR, TVA et contrôles de cohérence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
            >
              {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Readiness */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 shadow-sm">
          <p className="text-sm text-gray-500 mb-2">Prêt pour clôture fiscale</p>
          <p className={`text-4xl font-bold ${score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {score}%
          </p>
          {payload?.readiness_factors && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                ['Compta équilibrée', payload.readiness_factors.accounting_balanced],
                ['Factures validées', payload.readiness_factors.invoices_validated_pct >= 80],
                ['TVA cohérente', payload.readiness_factors.tva_consistent],
                ['Banque rapprochée', payload.readiness_factors.bank_reconciled_pct >= 90],
                ['Paie validée', payload.readiness_factors.payroll_validated],
                ['Sans alerte critique', payload.readiness_factors.no_critical_alerts],
                ['Contrats à jour', payload.readiness_factors.legal_not_expired],
                ['Liasse générée', payload.readiness_factors.liasse_generated],
              ].map(([label, ok]) => (
                <span
                  key={String(label)}
                  className={`px-2 py-1 rounded-lg ${ok ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}
                >
                  {ok ? '✓' : '○'} {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Summaries */}
        {payload && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border p-4">
              <Landmark size={14} className="text-blue-500 mb-2" />
              <p className="text-xs text-gray-500">Banque</p>
              <p className="text-sm font-semibold">{payload.bank.unreconciled_count} non rapprochées</p>
              <p className="text-xs text-gray-400">{formatMadAmountLabel(payload.bank.unreconciled_amount)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <Users size={14} className="text-green-500 mb-2" />
              <p className="text-xs text-gray-500">Paie brute / nette</p>
              <p className="text-sm font-semibold">{formatMadAmountLabel(payload.payroll.gross_salaries)}</p>
              <p className="text-xs text-gray-400">Net {formatMadAmountLabel(payload.payroll.net_salaries)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <Shield size={14} className="text-emerald-500 mb-2" />
              <p className="text-xs text-gray-500">CNSS / IR</p>
              <p className="text-sm font-semibold">CNSS {formatMadAmountLabel(payload.payroll.cnss_deductions)}</p>
              <p className="text-xs text-gray-400">IR {formatMadAmountLabel(payload.payroll.ir_retained)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <Receipt size={14} className="text-purple-500 mb-2" />
              <p className="text-xs text-gray-500">TVA / Bilan</p>
              <p className="text-sm font-semibold">
                Actif {formatMadAmountLabel(payload.accounting.bilan_actif)}
              </p>
              <p className="text-xs text-gray-400">
                {payload.accounting.bilan_balanced ? 'Équilibré' : 'Déséquilibré'}
              </p>
            </div>
          </div>
        )}

        {/* Checks */}
        <div className="bg-white rounded-xl border border-gray-100 mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm text-gray-700">
            Contrôles de validation ({checks.length})
          </div>
          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {checks.length === 0 && (
              <p className="text-sm text-gray-400 px-2">Aucun contrôle — générez la liasse.</p>
            )}
            {checks.map((c) => (
              <div key={c.id} className={`flex gap-2 p-2.5 rounded-lg border text-xs ${severityClass(c.severity)}`}>
                {c.severity === 'critical' ? <AlertTriangle size={14} className="shrink-0" /> : <CheckCircle size={14} className="shrink-0 opacity-50" />}
                <div>
                  <p className="font-medium">{c.title}{c.blocking ? ' (bloquant)' : ''}</p>
                  <p className="opacity-80">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        {showOverride && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-medium text-amber-800 mb-2">Dérogation administrateur (min. 10 caractères)</p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full text-sm border rounded-lg p-2"
              rows={2}
              placeholder="Motif de dérogation…"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading || !companyId}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}
            Générer / actualiser
          </button>
          <button
            type="button"
            onClick={() => void setStatus('validated')}
            disabled={loading || !record}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            Valider
          </button>
          <button
            type="button"
            onClick={() => void setStatus('filed')}
            disabled={loading || record?.status !== 'validated'}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
          >
            Déposer (filed)
          </button>
          <button
            type="button"
            onClick={downloadAudit}
            disabled={!companyId}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            <Download size={14} />
            Package audit JSON
          </button>
        </div>

        {record && (
          <p className="text-xs text-gray-400 mt-4">
            Statut : <strong>{record.status}</strong>
            {record.admin_override_reason ? ` · Dérogation : ${record.admin_override_reason}` : ''}
          </p>
        )}
      </main>
    </div>
  );
}
