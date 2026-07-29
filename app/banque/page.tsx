'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckCircle,
  FileUp,
  HelpCircle,
  Loader2,
  RefreshCcw,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ModuleEmptyState } from '@/app/components/onboarding/ModuleEmptyState';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { BankExportMenu } from '@/app/components/bank/BankExportMenu';
import { BankAlertCenter } from '@/app/components/bank/BankAlertCenter';
import { ValidationStatusBadge } from '@/app/components/validation/ValidationStatusBadge';
import { RowActions } from '@/app/components/actions';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';

type BankTx = {
  id: string;
  sourceDocumentId: string | null;
  transactionDate: string | null;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  validationStatus: string;
  reconciliations: { id: string; status: string; confidence: number; entity_type: string; match_reason?: string }[];
};

type ReconSummary = { matched: number; suggested: number; unmatched: number; rejected: number; total: number };

type PendingStatement = {
  id: string;
  title: string;
  filename: string | null;
  validationStatus: string;
  transactionCount: number;
  synced: boolean;
  statementId: string | null;
  syncedTransactionCount: number;
};

const BANK_ROW_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'transactionDate', label: 'Date' },
  { key: 'description', label: 'Libellé' },
  { key: 'reference', label: 'Référence' },
  { key: 'debit', label: 'Débit (MAD)', format: (v) => typeof v === 'number' && v > 0 ? v.toFixed(2) : '' },
  { key: 'credit', label: 'Crédit (MAD)', format: (v) => typeof v === 'number' && v > 0 ? v.toFixed(2) : '' },
  { key: 'validationStatus', label: 'Statut' },
];


function formatMad(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reconStatusLabel(tx: BankTx): { label: string; tone: 'matched' | 'suggested' | 'unmatched' } {
  const recons = tx.reconciliations;
  if (recons.some(r => r.status === 'matched')) return { label: 'Rapproché', tone: 'matched' };
  if (recons.some(r => r.status === 'suggested')) return { label: 'Suggéré', tone: 'suggested' };
  return { label: 'Non rapproché', tone: 'unmatched' };
}

export default function BanquePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [pendingStatements, setPendingStatements] = useState<PendingStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'validated'>('all');
  const [reconFilter, setReconFilter] = useState<'all' | 'matched' | 'suggested' | 'unmatched'>('all');

  const loadPending = useCallback(async (cid: string) => {
    const res = await fetch(`/api/bank/pending-statements?companyId=${encodeURIComponent(cid)}`, {
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json() as { statements?: PendingStatement[] };
    return data.statements ?? [];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = companyId ?? await getActiveCompanyDbRowId();
      if (!companyId && cid) setCompanyId(cid);
      if (!cid) {
        setTransactions([]);
        setSummary(null);
        setPendingStatements([]);
        return;
      }

      const params = new URLSearchParams({ limit: '200', companyId: cid });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const [txRes, reconRes, pending] = await Promise.all([
        fetch(`/api/bank/transactions?${params}`, { credentials: 'include' }),
        fetch(`/api/bank/reconciliation?companyId=${encodeURIComponent(cid)}`, { credentials: 'include' }),
        loadPending(cid),
      ]);

      if (txRes.ok) {
        const data = await txRes.json() as { transactions: BankTx[] };
        setTransactions(data.transactions ?? []);
      }

      if (reconRes.ok) {
        const data = await reconRes.json() as { summary: ReconSummary };
        setSummary(data.summary ?? null);
      }

      setPendingStatements(pending);
    } finally {
      setLoading(false);
    }
  }, [companyId, debouncedSearch, statusFilter, loadPending]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    return onCompanySwitched((cid) => {
      setCompanyId(cid);
    });
  }, []);

  const unsyncedCount = useMemo(
    () => pendingStatements.filter(s => !s.synced && s.transactionCount > 0).length,
    [pendingStatements],
  );

  const filtered = useMemo(() => {
    if (reconFilter === 'all') return transactions;
    return transactions.filter(tx => {
      const { tone } = reconStatusLabel(tx);
      if (reconFilter === 'unmatched') return tone === 'unmatched';
      if (reconFilter === 'matched') return tone === 'matched';
      if (reconFilter === 'suggested') return tone === 'suggested';
      return true;
    });
  }, [transactions, reconFilter]);

  const validateMatch = async (reconId: string, action: 'validate' | 'reject') => {
    await fetch('/api/bank/reconciliation', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reconId, action }),
    });
    void load();
  };

  const deleteTransaction = async (id: string) => {
    const res = await fetch(`/api/bank/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) return false;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    return true;
  };

  const updateTransaction = async (id: string, values: Record<string, string>) => {
    const res = await fetch(`/api/bank/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: values.description,
        reference: values.reference,
        transactionDate: values.transactionDate,
        debit: parseFloat(values.debit) || 0,
        credit: parseFloat(values.credit) || 0,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { transaction?: BankTx };
    if (data.transaction) {
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...data.transaction! } : t)));
    } else {
      void load();
    }
    return true;
  };

  const syncStatements = async (documentIds?: string[]) => {
    if (!companyId) return;
    setSyncing(true);
    setSyncError('');
    setSyncMessage('');
    try {
      const res = await fetch('/api/bank/sync-statements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, documentIds }),
      });
      const body = await res.json() as {
        synced?: number;
        totalTransactions?: number;
        errors?: { documentId: string; message: string }[];
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setSyncError(body.message ?? body.error ?? 'Synchronisation impossible.');
        return;
      }
      const synced = body.synced ?? 0;
      const txTotal = body.totalTransactions ?? 0;
      if (synced > 0) {
        setSyncMessage(`${synced} relevé(s) synchronisé(s) — ${txTotal} opération(s) importée(s).`);
        setImportOpen(false);
      } else if (body.errors?.length) {
        setSyncError(body.errors.map(e => e.message).join(' '));
      } else {
        setSyncMessage('Aucun relevé en attente de synchronisation.');
      }
      void load();
    } catch {
      setSyncError('Erreur réseau lors de la synchronisation.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 shrink-0 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 size={20} className="text-blue-600" />
              <h1 className="text-xl font-bold text-gray-800">Banque</h1>
              <BetaSurfaceBadge label="Rapprochement automatique" />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Relevés bancaires · opérations · rapprochement factures</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 text-sm text-white px-3 py-1.5 bg-[#1F497D] rounded-lg hover:bg-[#16365c] transition-colors"
            >
              <Upload size={14} />
              Importer un relevé
              {unsyncedCount > 0 && (
                <span className="ml-1 bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unsyncedCount}
                </span>
              )}
            </button>
            <BankExportMenu
              companyId={companyId}
              statusFilter={statusFilter}
              search={search}
              reconFilter={reconFilter}
              transactionCount={filtered.length}
              size="sm"
            />
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1.5 text-sm text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RefreshCcw size={14} />
              Actualiser
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {(syncMessage || syncError) && (
            <div className={`rounded-xl p-4 text-sm border ${
              syncError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              {syncError || syncMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 grid grid-cols-3 gap-3">
              <div className="text-center p-4 bg-green-50 rounded-xl border border-green-100">
                <CheckCircle size={18} className="text-green-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-700">{summary?.matched ?? 0}</p>
                <p className="text-xs text-green-600 font-medium">Rapprochés</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100">
                <HelpCircle size={18} className="text-amber-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-amber-700">{summary?.suggested ?? 0}</p>
                <p className="text-xs text-amber-600 font-medium">Suggérés</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-xl border border-red-100">
                <XCircle size={18} className="text-red-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-700">{summary?.unmatched ?? 0}</p>
                <p className="text-xs text-red-600 font-medium">Non rapprochés</p>
              </div>
            </div>
            <BankAlertCenter />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher libellé, référence…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2"
              >
                <option value="all">Tous statuts</option>
                <option value="draft">Brouillon</option>
                <option value="validated">Validé</option>
              </select>
              <select
                value={reconFilter}
                onChange={e => setReconFilter(e.target.value as typeof reconFilter)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2"
              >
                <option value="all">Tous rapprochements</option>
                <option value="matched">Rapprochés</option>
                <option value="suggested">Suggérés</option>
                <option value="unmatched">Non rapprochés</option>
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
            ) : filtered.length === 0 ? (
              <ModuleEmptyState
                module="bank"
                onPrimary={() => setImportOpen(true)}
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Libellé / Référence</th>
                    <th className="px-4 py-3 text-right">Débit</th>
                    <th className="px-4 py-3 text-right">Crédit</th>
                    <th className="px-4 py-3">Statut Rapprochement</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => {
                    const recon = tx.reconciliations.find(r => r.status === 'suggested') ?? tx.reconciliations[0];
                    const { label, tone } = reconStatusLabel(tx);
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{tx.transactionDate ?? '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 truncate max-w-xs">{tx.description ?? '—'}</p>
                          {tx.reference && <p className="text-[10px] text-gray-400">{tx.reference}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">{tx.debit > 0 ? formatMad(tx.debit) : '—'}</td>
                        <td className="px-4 py-3 text-right text-green-600">{tx.credit > 0 ? formatMad(tx.credit) : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              tone === 'matched' ? 'bg-green-100 text-green-700' :
                              tone === 'suggested' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {label}
                              {recon?.status === 'suggested' ? ` (${Math.round(recon.confidence)}%)` : ''}
                            </span>
                            {recon?.status === 'suggested' && recon.id && (
                              <button type="button" onClick={() => void validateMatch(recon.id, 'validate')}
                                className="text-[10px] text-blue-600 hover:underline">Valider</button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <ValidationStatusBadge status={tx.validationStatus as 'draft' | 'validated' | 'reviewed' | 'rejected'} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative inline-flex justify-end">
                            <RowActions
                              entityId={tx.id}
                              entityLabel={tx.description ?? tx.reference ?? 'Opération'}
                              entityType="opération bancaire"
                              exportData={{
                                id: tx.id,
                                transactionDate: tx.transactionDate,
                                description: tx.description,
                                reference: tx.reference,
                                debit: tx.debit,
                                credit: tx.credit,
                                validationStatus: tx.validationStatus,
                              }}
                              exportColumns={BANK_ROW_EXPORT_COLUMNS}
                              exportFilename="operation_bancaire"
                              exportTitle="Opération bancaire"
                              editFields={[
                                { key: 'transactionDate', label: 'Date', type: 'date', value: tx.transactionDate ?? '' },
                                { key: 'description', label: 'Libellé', value: tx.description ?? '', required: true },
                                { key: 'reference', label: 'Référence', value: tx.reference ?? '' },
                                { key: 'debit', label: 'Débit (MAD)', type: 'number', value: String(tx.debit || '') },
                                { key: 'credit', label: 'Crédit (MAD)', type: 'number', value: String(tx.credit || '') },
                              ]}
                              onEditSave={(values) => updateTransaction(tx.id, values)}
                              onDelete={() => deleteTransaction(tx.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {importOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Importer un relevé bancaire</h2>
                <button type="button" onClick={() => setImportOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start gap-3">
                    <FileUp size={20} className="text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Uploader via Documents IA</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Uploadez un PDF ou image de relevé — l&apos;OCR extrait automatiquement les opérations.
                      </p>
                      <Link
                        href="/documents"
                        className="inline-flex mt-2 text-xs text-blue-600 hover:underline font-medium"
                      >
                        Ouvrir Documents IA →
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <p className="text-sm font-medium text-gray-800">Synchroniser les relevés analysés</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Importe les relevés déjà analysés dans Documents IA vers les opérations bancaires.
                  </p>
                  {pendingStatements.length > 0 ? (
                    <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                      {pendingStatements.map(stmt => (
                        <li key={stmt.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                          <span className="truncate flex-1 mr-2">{stmt.title}</span>
                          <span className={`shrink-0 font-medium ${stmt.synced ? 'text-green-600' : 'text-amber-600'}`}>
                            {stmt.synced
                              ? `${stmt.syncedTransactionCount} op.`
                              : `${stmt.transactionCount} op. à sync.`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">Aucun relevé bancaire détecté dans Documents IA.</p>
                  )}
                  <button
                    type="button"
                    disabled={syncing || unsyncedCount === 0}
                    onClick={() => void syncStatements()}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#1F497D] text-white rounded-lg text-sm hover:bg-[#16365c] disabled:opacity-50"
                  >
                    {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                    Synchroniser les relevés
                    {unsyncedCount > 0 ? ` (${unsyncedCount})` : ''}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
