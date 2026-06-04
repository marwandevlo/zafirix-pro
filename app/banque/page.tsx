'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, RefreshCcw, Search } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ModuleEmptyState } from '@/app/components/onboarding/ModuleEmptyState';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { ReconciliationWidget } from '@/app/components/bank/ReconciliationWidget';
import { BankAlertCenter } from '@/app/components/bank/BankAlertCenter';
import { ValidationStatusBadge } from '@/app/components/validation/ValidationStatusBadge';

type BankTx = {
  id: string;
  transactionDate: string | null;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  validationStatus: string;
  reconciliations: { id: string; status: string; confidence: number; entity_type: string; match_reason?: string }[];
};

const TX_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'transactionDate', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'reference', label: 'Référence' },
  { key: 'debit', label: 'Débit (MAD)', format: v => typeof v === 'number' && v > 0 ? v.toFixed(2) : '' },
  { key: 'credit', label: 'Crédit (MAD)', format: v => typeof v === 'number' && v > 0 ? v.toFixed(2) : '' },
  { key: 'balance', label: 'Solde (MAD)', format: v => v != null ? Number(v).toFixed(2) : '' },
  { key: 'reconStatus', label: 'Rapprochement' },
  { key: 'validationStatus', label: 'Statut validation' },
  { key: 'sourceDocumentId', label: 'Source Document IA' },
];

function formatMad(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BanquePage() {
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'validated'>('all');
  const [reconFilter, setReconFilter] = useState<'all' | 'matched' | 'suggested' | 'unmatched'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/bank/transactions?${params}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { transactions: BankTx[] };
      setTransactions(data.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (reconFilter === 'all') return transactions;
    return transactions.filter(tx => {
      const statuses = tx.reconciliations.map(r => r.status);
      if (reconFilter === 'unmatched') return statuses.length === 0 || statuses.includes('unmatched');
      return statuses.includes(reconFilter);
    });
  }, [transactions, reconFilter]);

  const exportRows = useMemo(() => filtered.map(tx => ({
    id: tx.id,
    transactionDate: tx.transactionDate ?? '',
    description: tx.description ?? '',
    reference: tx.reference ?? '',
    debit: tx.debit,
    credit: tx.credit,
    balance: tx.balance,
    reconStatus: tx.reconciliations[0]?.status ?? '—',
    validationStatus: tx.validationStatus,
    sourceDocumentId: '',
  })), [filtered]);

  const validateMatch = async (reconId: string, action: 'validate' | 'reject') => {
    await fetch('/api/bank/reconciliation', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reconId, action }),
    });
    void load();
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
            <ExportMenu
              data={exportRows as unknown as Record<string, unknown>[]}
              columns={TX_EXPORT_COLUMNS}
              filename="operations_bancaires"
              title="Opérations bancaires"
              filters={{ statut: statusFilter, rapprochement: reconFilter, recherche: search }}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2"><ReconciliationWidget /></div>
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
              <ModuleEmptyState module="bank" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Débit</th>
                    <th className="px-4 py-3 text-right">Crédit</th>
                    <th className="px-4 py-3 text-right">Solde</th>
                    <th className="px-4 py-3">Rapprochement</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => {
                    const recon = tx.reconciliations[0];
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{tx.transactionDate ?? '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 truncate max-w-xs">{tx.description ?? '—'}</p>
                          {tx.reference && <p className="text-[10px] text-gray-400">{tx.reference}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">{tx.debit > 0 ? formatMad(tx.debit) : '—'}</td>
                        <td className="px-4 py-3 text-right text-green-600">{tx.credit > 0 ? formatMad(tx.credit) : '—'}</td>
                        <td className="px-4 py-3 text-right font-medium">{tx.balance != null ? formatMad(tx.balance) : '—'}</td>
                        <td className="px-4 py-3">
                          {recon ? (
                            <div className="flex items-center gap-1">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                recon.status === 'matched' ? 'bg-green-100 text-green-700' :
                                recon.status === 'suggested' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {recon.status} ({Math.round(recon.confidence)}%)
                              </span>
                              {recon.status === 'suggested' && recon.id && (
                                <button type="button" onClick={() => void validateMatch(recon.id, 'validate')}
                                  className="text-[10px] text-blue-600 hover:underline">Valider</button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ValidationStatusBadge status={tx.validationStatus as 'draft' | 'validated' | 'reviewed' | 'rejected'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
