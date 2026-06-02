'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, Eye, RefreshCw, Loader2, Filter,
  AlertTriangle, FileText, ChevronRight, RotateCcw, ClipboardList,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ValidationKpiCards } from '@/app/components/validation/ValidationKpiCards';
import { ValidationQueueTable } from '@/app/components/validation/ValidationQueueTable';
import { ValidationStatusBadge } from '@/app/components/validation/ValidationStatusBadge';
import { SourceDocumentBadge } from '@/app/components/SourceDocumentBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

type RoutingRecord = {
  id: string;
  source_document_id: string;
  source_document_filename: string | null;
  source_document_type: string;
  target_module: string;
  module_label: string;
  target_entity_type: string;
  target_entity_id: string | null;
  validation_status: string;
  extraction_confidence: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type QueueResponse = {
  ok: boolean;
  records: RoutingRecord[];
  summary: { module: string; label: string; draft: number; reviewed: number }[];
  pagination: { limit: number; offset: number; returned: number };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_invoice: "Facture d'achat",
  sales_invoice: 'Facture de vente',
  receipt: 'Reçu',
  bank_statement: 'Relevé bancaire',
  payroll_slip: 'Bulletin de paie',
  legal_contract: 'Contrat',
  company_statutes: 'Statuts',
  hr_document: 'Document RH',
  unknown: 'Document',
};

function docLabel(type: string): string {
  return DOC_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function confidenceBadge(score: number | null) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const cls = score >= 0.85 ? 'bg-green-50 text-green-600' : score >= 0.60 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600';
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{pct}%</span>;
}

function extractAmount(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const amt = payload.amount_ttc ?? payload.amount ?? payload.closing_balance ?? payload.net_salary;
  if (typeof amt === 'number' && amt > 0) return `${amt.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`;
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

type StatusFilter = 'draft' | 'reviewed' | 'validated' | 'rejected' | 'all';

export default function ValidationPage() {
  const [records, setRecords] = useState<RoutingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('draft');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const status = statusFilter === 'all' ? 'draft,reviewed,validated,rejected' : statusFilter;
    const modQ = moduleFilter !== 'all' ? `&module=${moduleFilter}` : '';
    try {
      const res = await fetch(`/api/validation/queue?status=${status}${modQ}&limit=100`, { credentials: 'include' });
      const data = await res.json() as QueueResponse;
      if (data.ok) setRecords(data.records);
    } catch {
      showMessage('error', 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, moduleFilter]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const performAction = useCallback(async (ids: string[], action: 'review' | 'validate' | 'reject') => {
    const isBulk = ids.length > 1;
    if (isBulk) setBulkLoading(true);
    else setActionLoading(ids[0]);
    try {
      const res = await fetch('/api/validation/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json() as { ok?: boolean; updated?: number; message?: string };
      if (!res.ok || !data.ok) {
        showMessage('error', data.message ?? 'Échec de la mise à jour.');
        return;
      }
      const actionLabel = action === 'validate' ? 'validé(s)' : action === 'reject' ? 'rejeté(s)' : 'marqué(s) pour révision';
      showMessage('success', `${data.updated ?? ids.length} enregistrement(s) ${actionLabel}.`);
      setSelectedIds(new Set());
      await loadRecords();
    } catch {
      showMessage('error', 'Erreur réseau.');
    } finally {
      setActionLoading(null);
      setBulkLoading(false);
    }
  }, [loadRecords]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  };

  const statusFilterOptions: { value: StatusFilter; label: string; color: string }[] = [
    { value: 'draft', label: 'Brouillons', color: 'amber' },
    { value: 'reviewed', label: 'En révision', color: 'purple' },
    { value: 'validated', label: 'Validés', color: 'green' },
    { value: 'rejected', label: 'Rejetés', color: 'red' },
    { value: 'all', label: 'Tous', color: 'gray' },
  ];

  const modules = [...new Set(records.map(r => r.target_module))];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AppSidebar variant="module" />
      <main className="flex-1 min-w-0 p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList size={24} className="text-rose-600" />
              Centre de Validation
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Validez, révisez ou rejetez les enregistrements créés par Documents IA.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRecords()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RotateCcw size={14} />
            Actualiser
          </button>
        </div>

        {/* Flash */}
        {message && (
          <div className={`px-4 py-2.5 rounded-xl text-sm font-medium border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* KPI Cards */}
        <ValidationKpiCards />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Queue Summary */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-4">File d'attente par module</h2>
            <ValidationQueueTable compact />
            <a href="/validation" className="flex items-center gap-1 mt-3 text-xs text-rose-600 hover:text-rose-700 font-medium">
              Voir tout <ChevronRight size={12} />
            </a>
          </div>

          {/* Records Table */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm">

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-100">
              <Filter size={14} className="text-gray-400 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {statusFilterOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                      statusFilter === opt.value
                        ? opt.color === 'amber' ? 'bg-amber-500 text-white border-amber-500'
                          : opt.color === 'purple' ? 'bg-purple-600 text-white border-purple-600'
                          : opt.color === 'green' ? 'bg-green-600 text-white border-green-600'
                          : opt.color === 'red' ? 'bg-red-600 text-white border-red-600'
                          : 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {modules.length > 0 && (
                <select
                  value={moduleFilter}
                  onChange={e => setModuleFilter(e.target.value)}
                  className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-rose-300"
                >
                  <option value="all">Tous les modules</option>
                  {modules.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-rose-50 border-b border-rose-100">
                <span className="text-xs font-medium text-rose-700">{selectedIds.size} sélectionné(s)</span>
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => void performAction([...selectedIds], 'review')}
                    disabled={bulkLoading}
                    className="text-xs px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
                  >
                    Marquer révisé
                  </button>
                  <button
                    type="button"
                    onClick={() => void performAction([...selectedIds], 'validate')}
                    disabled={bulkLoading}
                    className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                  >
                    Valider
                  </button>
                  <button
                    type="button"
                    onClick={() => void performAction([...selectedIds], 'reject')}
                    disabled={bulkLoading}
                    className="text-xs px-2.5 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              ) : records.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <CheckCircle2 size={32} className="mb-2 text-green-400" />
                  <p className="text-sm">Aucun enregistrement dans cette catégorie.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 w-6">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === records.length && records.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-3">Document</th>
                      <th className="px-4 py-3">Module</th>
                      <th className="px-4 py-3">Montant</th>
                      <th className="px-4 py-3">Confiance</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(rec => {
                      const isSelected = selectedIds.has(rec.id);
                      const isActing = actionLoading === rec.id;
                      const amount = extractAmount(rec.payload);
                      return (
                        <tr key={rec.id} className={`border-b border-gray-50 transition-colors ${isSelected ? 'bg-rose-50/40' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(rec.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <FileText size={14} className="text-gray-400 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-gray-800 font-medium text-xs truncate max-w-[160px]" title={rec.source_document_filename ?? ''}>
                                  {rec.source_document_filename ?? `Doc ${rec.source_document_id.slice(0, 8)}`}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-gray-400 text-[10px]">{docLabel(rec.source_document_type)}</span>
                                  <SourceDocumentBadge sourceDocumentId={rec.source_document_id} variant="compact" />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                              {rec.module_label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-700">
                            {amount ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {confidenceBadge(rec.extraction_confidence)}
                          </td>
                          <td className="px-4 py-3">
                            <ValidationStatusBadge status={rec.validation_status} size="xs" />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {new Date(rec.created_at).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-4 py-3">
                            {isActing ? (
                              <Loader2 size={14} className="animate-spin text-gray-400" />
                            ) : (
                              <div className="flex items-center gap-1">
                                {rec.validation_status !== 'reviewed' && rec.validation_status !== 'validated' && (
                                  <button
                                    type="button"
                                    onClick={() => void performAction([rec.id], 'review')}
                                    title="Marquer révisé"
                                    className="text-purple-400 hover:text-purple-600 transition-colors"
                                  >
                                    <Eye size={14} />
                                  </button>
                                )}
                                {rec.validation_status !== 'validated' && (
                                  <button
                                    type="button"
                                    onClick={() => void performAction([rec.id], 'validate')}
                                    title="Valider"
                                    className="text-green-400 hover:text-green-600 transition-colors"
                                  >
                                    <CheckCircle2 size={14} />
                                  </button>
                                )}
                                {rec.validation_status !== 'rejected' && (
                                  <button
                                    type="button"
                                    onClick={() => void performAction([rec.id], 'reject')}
                                    title="Rejeter"
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                  >
                                    <XCircle size={14} />
                                  </button>
                                )}
                                <a
                                  href={`/documents?highlight=${rec.source_document_id}`}
                                  title="Voir document source"
                                  className="text-blue-300 hover:text-blue-500 transition-colors"
                                >
                                  <ChevronRight size={14} />
                                </a>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Workflow legend */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
              <AlertTriangle size={12} className="shrink-0" />
              <span>Workflow:</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> Brouillon
              </span>
              <RefreshCw size={10} />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" /> Révisé
              </span>
              <RefreshCw size={10} />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" /> Validé
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
