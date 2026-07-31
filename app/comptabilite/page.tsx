'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import { listSupplierInvoices } from '@/app/lib/atlas-supplier-invoices-repository';
import type { AtlasSupplierInvoice } from '@/app/types/atlas-supplier-invoice';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isOverdue, todayYmd } from '@/app/lib/atlas-dates';
import { listAtlasPayments } from '@/app/lib/atlas-payments-repository';
import type { AtlasPayment } from '@/app/types/atlas-payment';
import { fetchAi } from '@/app/lib/fetch-ai';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ModuleEmptyState } from '@/app/components/onboarding/ModuleEmptyState';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';
import { SourceDocumentBadge } from '@/app/components/SourceDocumentBadge';
import { ValidationStatusBadge } from '@/app/components/validation/ValidationStatusBadge';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { EntityAuditTable } from '@/app/components/history/EntityAuditTable';
import { RowActions } from '@/app/components/actions';
import { isValidPcgeAccount, isValidIce, isValidIf } from '@/app/lib/atlas-morocco-compliance';
import GlobalTable from '@/app/components/data-grid/GlobalTable';
import type { GlobalTableColumn, GlobalTableRow } from '@/app/components/data-grid/GlobalTable';
import {
  filterRowsBySelectedIds,
  normalizeGlobalTableRows,
  pruneSelectedIds,
  runOptimisticBulkDelete,
} from '@/app/components/data-grid/global-table-id';
import { postBulkDelete, formatBulkDeleteError } from '@/app/lib/atlas-bulk-delete';
import {
  getAccountingEntrySelectionId,
  partitionAccountingEntryDeleteIds,
  resolveToPostgresUuid,
} from '@/app/lib/atlas-id-validation';
import { showAtlasErrorToast } from '@/app/lib/atlas-toast';
import { exportTable } from '@/app/lib/atlas-table-export';
import { openWhatsAppShare } from '@/app/lib/atlas-quick-share';

const SUPPLIER_INVOICE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'invoiceNumber', label: 'N° Facture' },
  { key: 'supplierName', label: 'Fournisseur' },
  { key: 'issueDate', label: 'Date' },
  { key: 'status', label: 'Statut' },
  { key: 'totalTTC', label: 'TTC (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
];

const ECRITURE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'libelle', label: 'Libellé' },
  { key: 'compte', label: 'Compte' },
  { key: 'debit', label: 'Débit (MAD)', format: v => typeof v === 'number' && v > 0 ? v.toFixed(2) : '' },
  { key: 'credit', label: 'Crédit (MAD)', format: v => typeof v === 'number' && v > 0 ? v.toFixed(2) : '' },
  { key: 'sourceDocumentId', label: 'Source Document IA' },
  { key: 'validationStatus', label: 'Statut' },
];
import {
  deleteAtlasAccountingEntryBySelectionId,
  listAtlasAccountingEntries,
  upsertAtlasAccountingEntry,
} from '@/app/lib/atlas-accounting-repository';
import { refreshAtlasUsageState } from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { AtlasAccountingEntry } from '@/app/types/atlas-accounting';
import {
  getCompanyWorkspaceGeneration,
  isCurrentCompanyWorkspaceGeneration,
} from '@/app/lib/atlas-company-client-cache';
import { useCompanyWorkspaceReset } from '@/app/lib/use-company-workspace-reset';

type Ecriture = AtlasAccountingEntry;

type SupplierTableRow = GlobalTableRow & {
  invoiceNumber: string;
  supplierName: string;
  supplierIce: string;
  supplierIf: string;
  issueDate: string;
  status: string;
  totalTTC: number | null;
};

type JournalTableRow = GlobalTableRow & {
  date: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  validationStatus?: string | null;
  rowId?: string | null;
};

export default function ComptabilitePage() {
  const [activeTab, setActiveTab] = useState<'journal' | 'grandlivre' | 'bilan' | 'historique'>('journal');
  const [invoices, setInvoices] = useState<AtlasInvoice[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<AtlasSupplierInvoice[]>([]);
  const [payments, setPayments] = useState<AtlasPayment[]>([]);
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [selectedJournalIds, setSelectedJournalIds] = useState<string[]>([]);

  const [form, setForm] = useState({ date: '', libelle: '', compte: '', debit: '', credit: '' });
  const [showForm, setShowForm] = useState(false);
  const [insight, setInsight] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });

  const wipeAccountingState = useCallback(() => {
    setInvoices([]);
    setSupplierInvoices([]);
    setPayments([]);
    setEcritures([]);
    setActiveCompanyId(null);
    setSelectedSupplierIds([]);
    setSelectedJournalIds([]);
    setInsight({ loading: false, text: '' });
  }, []);

  const reloadAccountingData = useCallback(async () => {
    const scope = getCompanyWorkspaceGeneration();
    if (isAtlasSupabaseDataEnabled()) {
      await refreshAtlasUsageState();
    }
    if (!isCurrentCompanyWorkspaceGeneration(scope)) return;

    const companyId = await getActiveCompanyDbRowId();
    if (!isCurrentCompanyWorkspaceGeneration(scope)) return;

    setActiveCompanyId(companyId);
    setInvoices(companyId ? await listAtlasInvoices({ companyId }) : []);
    setPayments(await listAtlasPayments(companyId ? { companyId } : undefined));
    setEcritures(await listAtlasAccountingEntries(companyId ? { companyId } : undefined));
    if (!isCurrentCompanyWorkspaceGeneration(scope)) return;

    if (companyId) {
      setSupplierInvoices(await listSupplierInvoices(companyId));
    } else {
      setSupplierInvoices([]);
    }
  }, []);

  useCompanyWorkspaceReset(wipeAccountingState, () => {
    void reloadAccountingData();
  });

  useEffect(() => {
    void reloadAccountingData();
  }, [reloadAccountingData]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void reloadAccountingData();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadAccountingData]);

  const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);

  const journalExportRows = useMemo(
    () =>
      ecritures.map((e) => ({
        id: getAccountingEntrySelectionId(e),
        date: e.date,
        libelle: e.libelle,
        compte: e.compte,
        debit: e.debit,
        credit: e.credit,
        sourceDocumentId: e.sourceDocumentId ?? '',
        validationStatus: e.validationStatus ?? '',
      })),
    [ecritures],
  );

  const supplierTableRows = useMemo(
    (): SupplierTableRow[] =>
      normalizeGlobalTableRows(
        supplierInvoices.slice(0, 10).map((inv) => ({
          id: String(inv.id),
          invoiceNumber: inv.invoiceNumber ?? '',
          supplierName: inv.supplierName ?? '',
          supplierIce: inv.supplierIce ?? '',
          supplierIf: inv.supplierIf ?? '',
          issueDate: inv.issueDate ?? '',
          status: inv.status ?? '',
          totalTTC: inv.totalTTC,
          numero: inv.invoiceNumber,
        })) as Record<string, unknown>[],
      ) as SupplierTableRow[],
    [supplierInvoices],
  );

  const journalTableRows = useMemo(
    (): JournalTableRow[] =>
      normalizeGlobalTableRows(
        ecritures.map((e) => ({
          id: getAccountingEntrySelectionId(e),
          date: e.date,
          libelle: e.libelle,
          compte: e.compte,
          debit: e.debit,
          credit: e.credit,
          sourceDocumentId: e.sourceDocumentId,
          sourceDocumentType: e.sourceDocumentType,
          validationStatus: e.validationStatus,
          rowId: e.rowId,
          localId: e.id,
        })) as Record<string, unknown>[],
      ) as JournalTableRow[],
    [ecritures],
  );

  useEffect(() => {
    setSelectedSupplierIds((prev) => pruneSelectedIds(prev, supplierTableRows));
  }, [supplierTableRows]);

  useEffect(() => {
    setSelectedJournalIds((prev) => pruneSelectedIds(prev, journalTableRows));
  }, [journalTableRows]);

  const accountingKpis = useMemo(() => {
    const totalFacture = invoices.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0);

    const paymentsByInvoice = new Map<string, number>();
    for (const p of payments) {
      const key = String(p.invoiceId);
      paymentsByInvoice.set(key, (paymentsByInvoice.get(key) ?? 0) + (p.paidAmount || 0));
    }

    const paidForInvoice = (inv: AtlasInvoice): number => {
      const key = String(inv.id);
      const sum = paymentsByInvoice.get(key) ?? 0;
      return sum > 0 ? sum : (inv.paidAmount ?? 0);
    };

    const totalPaye = invoices.reduce((sum, inv) => sum + paidForInvoice(inv), 0);
    const resteAPayer = invoices.reduce((sum, inv) => sum + Math.max(0, (inv.totalTTC || 0) - paidForInvoice(inv)), 0);

    const balanceClient = resteAPayer;
    const balanceFournisseur = supplierInvoices
      .filter((inv) => inv.status === 'unpaid' || inv.status === 'needs_review')
      .reduce((sum, inv) => sum + (inv.totalTTC ?? 0), 0);
    const soldeGlobal = balanceClient - balanceFournisseur;

    const now = todayYmd();
    const overdue = invoices
      .filter((inv) => {
        const remaining = Math.max(0, (inv.totalTTC || 0) - paidForInvoice(inv));
        return remaining > 0 && isOverdue(inv.dueDate, false, now);
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    return {
      balanceClient,
      balanceFournisseur,
      totalFacture,
      totalPaye,
      resteAPayer,
      soldeGlobal,
      overdue,
    };
  }, [invoices, payments, supplierInvoices]);

  useEffect(() => {
    if (accountingKpis.overdue.length === 0) {
      queueMicrotask(() => setInsight({ loading: false, text: '' }));
      return;
    }
    let cancelled = false;
    const run = async () => {
      setInsight({ loading: true, text: '' });
      const top = accountingKpis.overdue.slice(0, 5).map((inv) => `- ${inv.number} (${inv.clientName}) · échéance ${inv.dueDate} · TTC ${formatMadAmountLabel(inv.totalTTC || 0)}`).join('\n');
      const fallback =
        `Factures en retard: ${accountingKpis.overdue.length}.\n` +
        `Recommandation: relance rapide (mail + appel), puis proposition d’échéancier, et suivi hebdomadaire.\n\n` +
        `Top:\n${top}`;

      try {
        const res = await fetchAi({
          type: 'consultant',
          systemPrompt: 'Tu es un assistant comptable. Réponds en français, concis, orienté action. Pas de tableaux.',
          message:
            `Résume les factures en retard et propose une action simple.\n` +
            `Factures (top):\n${top}\n\n` +
            `Format:\n1) Résumé (1 phrase)\n2) Recommandation (2 bullets)\n3) Prochaine action (1 phrase)`,
        });
        const raw: unknown = await res.json().catch(() => ({}));
        const responseText =
          typeof raw === 'object' &&
          raw !== null &&
          'response' in raw &&
          typeof (raw as { response: unknown }).response === 'string'
            ? String((raw as { response: string }).response).trim()
            : '';
        const text = responseText || fallback;
        if (!cancelled) setInsight({ loading: false, text });
      } catch {
        if (!cancelled) setInsight({ loading: false, text: fallback });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [accountingKpis.overdue]);

  const addEcriture = async () => {
    if (!form.libelle || !form.compte) return;
    const entry: Ecriture = {
      id: Date.now(),
      date: form.date || new Date().toISOString().split('T')[0],
      libelle: form.libelle,
      compte: form.compte,
      debit: parseFloat(form.debit) || 0,
      credit: parseFloat(form.credit) || 0,
    };
    const result = await upsertAtlasAccountingEntry(entry, { companyId: activeCompanyId });
    if (result.ok) {
      await reloadAccountingData();
    }
    setForm({ date: '', libelle: '', compte: '', debit: '', credit: '' });
    setShowForm(false);
  };

  const deleteEcriture = async (selectionId: string): Promise<boolean> => {
    console.debug('[Comptabilité] deleteEcriture', { selectionId });
    const { uuidIds, localIds, skippedIds } = partitionAccountingEntryDeleteIds([selectionId]);

    if (uuidIds.length === 0 && localIds.length === 0) {
      console.warn('[Comptabilité] deleteEcriture — identifiant invalide', { selectionId, skippedIds });
      showAtlasErrorToast(`Identifiant invalide : ${selectionId}`);
      return false;
    }

    try {
      if (isAtlasSupabaseDataEnabled() && uuidIds.length > 0) {
        const res = await fetch(`/api/accounting/entries/${encodeURIComponent(uuidIds[0])}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
      } else {
        const targetId = localIds[0] ?? uuidIds[0];
        const result = await deleteAtlasAccountingEntryBySelectionId(targetId);
        if (!result.ok) throw new Error(result.error);
      }

      setEcritures((prev) =>
        prev.filter((e) => getAccountingEntrySelectionId(e) !== selectionId),
      );
      return true;
    } catch (err) {
      console.error('[Comptabilité] deleteEcriture failed', err);
      showAtlasErrorToast(formatBulkDeleteError(err));
      return false;
    }
  };

  const updateEcriture = async (selectionId: string, values: Record<string, string>) => {
    const { uuidIds } = partitionAccountingEntryDeleteIds([selectionId]);
    const rowId = uuidIds[0] ?? resolveToPostgresUuid(selectionId);
    if (!rowId) return false;

    const res = await fetch(`/api/accounting/entries/${encodeURIComponent(rowId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: values.date,
        libelle: values.libelle,
        compte: values.compte,
        debit: parseFloat(values.debit) || 0,
        credit: parseFloat(values.credit) || 0,
      }),
    });
    if (!res.ok) return false;
    void reloadAccountingData();
    return true;
  };

  const deleteSupplierInvoiceRow = async (id: string) => {
    const res = await fetch(`/api/supplier-invoices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) return false;
    setSupplierInvoices((prev) => prev.filter((inv) => String(inv.id) !== id));
    return true;
  };

  const updateSupplierInvoiceRow = async (id: string, values: Record<string, string>) => {
    const res = await fetch(`/api/supplier-invoices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceNumber: values.invoiceNumber,
        supplierName: values.supplierName,
        issueDate: values.issueDate,
        totalTTC: parseFloat(values.totalTTC) || 0,
        supplierIce: values.supplierIce,
        supplierIf: values.supplierIf,
      }),
    });
    if (!res.ok) return false;
    void reloadAccountingData();
    return true;
  };

  const supplierById = useMemo(
    () => new Map(supplierInvoices.map((inv) => [String(inv.id), inv])),
    [supplierInvoices],
  );

  const ecritureBySelectionId = useMemo(() => {
    const map = new Map<string, Ecriture>();
    for (const e of ecritures) {
      map.set(getAccountingEntrySelectionId(e), e);
    }
    return map;
  }, [ecritures]);

  const supplierTableColumns = useMemo((): GlobalTableColumn<SupplierTableRow>[] => [
    { header: 'N°', accessor: 'invoiceNumber', render: (row) => row.invoiceNumber || '—' },
    { header: 'Fournisseur', accessor: 'supplierName' },
    {
      header: 'ICE',
      accessor: 'supplierIce',
      render: (row) => (
        <span className={`text-xs font-mono ${row.supplierIce ? 'text-gray-700' : 'text-red-600'}`}>
          {row.supplierIce || '—'}
        </span>
      ),
    },
    {
      header: 'IF',
      accessor: 'supplierIf',
      render: (row) => (
        <span className={`text-xs font-mono ${row.supplierIf ? 'text-gray-700' : 'text-red-600'}`}>
          {row.supplierIf || '—'}
        </span>
      ),
    },
    { header: 'Date', accessor: 'issueDate' },
    {
      header: 'Statut',
      accessor: 'status',
      render: (row) => (
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          row.status === 'paid'
            ? 'bg-green-100 text-green-700'
            : row.status === 'needs_review'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-blue-100 text-blue-700'
        }`}>
          {row.status === 'needs_review' ? 'À compléter' : row.status === 'paid' ? 'Payée' : 'À payer'}
        </span>
      ),
    },
    {
      header: 'TTC',
      accessor: 'totalTTC',
      className: 'text-right',
      render: (row) => (row.totalTTC != null ? formatMadAmountLabel(row.totalTTC) : '—'),
    },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'text-right',
      render: (row) => {
        const inv = supplierById.get(row.id);
        if (!inv) return null;
        return (
          <div className="relative inline-flex justify-end">
            <RowActions
              entityId={String(inv.id)}
              entityLabel={inv.invoiceNumber || inv.supplierName}
              entityType="facture fournisseur"
              exportData={{
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                supplierName: inv.supplierName,
                issueDate: inv.issueDate,
                status: inv.status,
                totalTTC: inv.totalTTC,
              }}
              exportColumns={SUPPLIER_INVOICE_EXPORT_COLUMNS}
              exportFilename="facture_fournisseur"
              editFields={[
                { key: 'invoiceNumber', label: 'N° Facture', value: inv.invoiceNumber ?? '' },
                { key: 'supplierName', label: 'Fournisseur', value: inv.supplierName ?? '', required: true },
                {
                  key: 'supplierIce',
                  label: 'ICE fournisseur *',
                  value: inv.supplierIce ?? '',
                  required: true,
                  validate: (v) => (isValidIce(v) ? null : 'ICE obligatoire (15 chiffres)'),
                },
                {
                  key: 'supplierIf',
                  label: 'IF fournisseur *',
                  value: inv.supplierIf ?? '',
                  required: true,
                  validate: (v) => (isValidIf(v) ? null : 'IF obligatoire (7-8 chiffres)'),
                },
                { key: 'issueDate', label: 'Date', type: 'date', value: inv.issueDate ?? '' },
                { key: 'totalTTC', label: 'TTC (MAD)', type: 'number', value: String(inv.totalTTC ?? '') },
              ]}
              onEditSave={(values) => updateSupplierInvoiceRow(String(inv.id), values)}
              onDelete={() => deleteSupplierInvoiceRow(String(inv.id))}
            />
          </div>
        );
      },
    },
  ], [supplierById]);

  const journalTableColumns = useMemo((): GlobalTableColumn<JournalTableRow>[] => [
    { header: 'Date', accessor: 'date' },
    {
      header: 'Libelle',
      accessor: 'libelle',
      render: (row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span>{row.libelle}</span>
          {row.sourceDocumentId ? (
            <SourceDocumentBadge sourceDocumentId={row.sourceDocumentId} sourceDocumentType={row.sourceDocumentType ?? undefined} variant="compact" />
          ) : null}
          {row.validationStatus && row.validationStatus !== 'draft' ? (
            <ValidationStatusBadge status={row.validationStatus} size="xs" />
          ) : null}
        </div>
      ),
    },
    { header: 'Compte', accessor: 'compte', render: (row) => <span className="font-mono">{row.compte}</span> },
    {
      header: 'Debit',
      accessor: 'debit',
      className: 'text-right',
      render: (row) => <span className="text-blue-600">{row.debit > 0 ? formatMadAmountLabel(row.debit) : '-'}</span>,
    },
    {
      header: 'Credit',
      accessor: 'credit',
      className: 'text-right',
      render: (row) => <span className="text-green-600">{row.credit > 0 ? formatMadAmountLabel(row.credit) : '-'}</span>,
    },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'text-right',
      render: (row) => {
        const e = ecritureBySelectionId.get(row.id);
        if (!e) return null;
        const selectionId = getAccountingEntrySelectionId(e);
        return (
          <div className="relative inline-flex justify-end">
            <RowActions
              entityId={selectionId}
              entityLabel={e.libelle}
              entityType="écriture comptable"
              exportData={{
                id: selectionId,
                date: e.date,
                libelle: e.libelle,
                compte: e.compte,
                debit: e.debit,
                credit: e.credit,
                sourceDocumentId: e.sourceDocumentId,
                validationStatus: e.validationStatus,
              }}
              exportColumns={ECRITURE_EXPORT_COLUMNS}
              exportFilename="ecriture_comptable"
              editFields={[
                { key: 'date', label: 'Date', type: 'date', value: e.date },
                { key: 'libelle', label: 'Libellé', value: e.libelle, required: true },
                {
                  key: 'compte',
                  label: 'Compte PCGE',
                  value: e.compte,
                  required: true,
                  validate: (v) => (isValidPcgeAccount(v) ? null : 'Compte PCGE invalide (3–8 chiffres)'),
                },
                { key: 'debit', label: 'Débit (MAD)', type: 'number', value: String(e.debit || '') },
                { key: 'credit', label: 'Crédit (MAD)', type: 'number', value: String(e.credit || '') },
              ]}
              onEditSave={(values) => updateEcriture(selectionId, values)}
              onDelete={() => deleteEcriture(selectionId)}
              hideDelete={!!e.sourceDocumentId && e.validationStatus === 'validated'}
            />
          </div>
        );
      },
    },
  ], [ecritureBySelectionId]);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module">
        {(['journal', 'grandlivre', 'bilan', 'historique'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${activeTab === tab ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
          >
            <BookOpen size={16} />
            {tab === 'journal' ? 'Journal' : tab === 'grandlivre' ? 'Grand-livre' : tab === 'bilan' ? 'Bilan' : 'Historique'}
          </button>
        ))}
      </AppSidebar>

      <main className="flex-1 flex flex-col min-h-0">
        <header className="relative z-20 overflow-visible bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Comptabilite</h1>
            <p className="text-xs text-gray-400 mt-0.5">KPIs factures · journal enregistré</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu
              data={journalExportRows}
              columns={ECRITURE_EXPORT_COLUMNS}
              filename="journal_comptable"
              title="Journal Comptable"
              idKey="id"
              selectedIds={selectedJournalIds.length > 0 ? new Set(selectedJournalIds) : undefined}
              context={{
                Société: activeCompanyId ?? '—',
                'Total débit': formatMadAmountLabel(totalDebit),
                'Total crédit': formatMadAmountLabel(totalCredit),
              }}
              size="sm"
            />
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors">
              <Plus size={16} /> Nouvelle ecriture
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Balance client</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{formatMadAmountLabel(accountingKpis.balanceClient)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Balance fournisseur</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{formatMadAmountLabel(accountingKpis.balanceFournisseur)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Solde global</p>
              <p className={`text-2xl font-bold mt-1 ${accountingKpis.soldeGlobal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatMadAmountLabel(accountingKpis.soldeGlobal)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total facturé</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{formatMadAmountLabel(accountingKpis.totalFacture)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total payé</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatMadAmountLabel(accountingKpis.totalPaye)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Reste à payer</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatMadAmountLabel(accountingKpis.resteAPayer)}</p>
            </div>
          </div>

          {supplierInvoices.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-800 text-sm">Factures fournisseur (OCR)</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Données enregistrées depuis Documents IA</p>
                </div>
                <ExportMenu
                  data={supplierTableRows as unknown as Record<string, unknown>[]}
                  columns={SUPPLIER_INVOICE_EXPORT_COLUMNS}
                  filename="factures_fournisseur"
                  title="Factures fournisseur"
                  selectedIds={selectedSupplierIds.length > 0 ? new Set(selectedSupplierIds) : undefined}
                  size="xs"
                />
              </div>
              <div className="p-4">
                <GlobalTable
                  columns={supplierTableColumns}
                  data={supplierTableRows}
                  selectedIds={selectedSupplierIds}
                  onSelectionChange={setSelectedSupplierIds}
                  onShare={(ids) => {
                    const selected = filterRowsBySelectedIds(supplierTableRows as unknown as Record<string, unknown>[], ids) as SupplierTableRow[];
                    const summary = selected.map((row) => `- ${row.invoiceNumber || row.supplierName}: ${row.totalTTC != null ? formatMadAmountLabel(row.totalTTC) : '—'}`).join('\n');
                    openWhatsAppShare(`Factures fournisseur:\n${summary}`);
                  }}
                  onDownload={(ids) => {
                    const selected = filterRowsBySelectedIds(supplierTableRows as unknown as Record<string, unknown>[], ids);
                    void exportTable('xlsx', selected, SUPPLIER_INVOICE_EXPORT_COLUMNS, 'factures_fournisseur');
                  }}
                  onDelete={(ids) => {
                    void runOptimisticBulkDelete({
                      ids,
                      skipConfirm: true,
                      onOptimistic: () => {
                        setSelectedSupplierIds([]);
                        setSupplierInvoices((prev) => prev.filter((inv) => !ids.includes(String(inv.id))));
                      },
                      onPersist: async (deleteIds) => {
                        await postBulkDelete('/api/supplier-invoices/bulk-delete', deleteIds, {
                          companyId: activeCompanyId ?? undefined,
                        });
                      },
                      onRollback: () => {
                        void reloadAccountingData();
                      },
                      onPersistError: () => {
                        void reloadAccountingData();
                      },
                    });
                  }}
                  hideRowActions
                  clearSelectionOnDelete={false}
                />
              </div>
            </div>
          )}

          {accountingKpis.overdue.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 text-sm">Alerte paiements · Factures en retard</h2>
                <span className="text-xs text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                  {accountingKpis.overdue.length} en retard
                </span>
              </div>
              <div className="px-6 py-4 border-b border-red-100 bg-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Insight IA</p>
                    <p className="text-xs text-gray-400">Résumé et recommandation sur les retards</p>
                  </div>
                  {insight.loading && <p className="text-xs text-gray-400">Analyse…</p>}
                </div>
                {insight.text && (
                  <div className="mt-3 rounded-xl border border-red-100 bg-red-50/30 p-4">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap wrap-break-word">{insight.text}</pre>
                  </div>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3">Numéro</th>
                    <th className="px-6 py-3">Client</th>
                    <th className="px-6 py-3">Date émission</th>
                    <th className="px-6 py-3">Date échéance</th>
                    <th className="px-6 py-3 text-right">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {accountingKpis.overdue.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-700">{inv.number}</td>
                      <td className="px-6 py-3 text-gray-600">{inv.clientName}</td>
                      <td className="px-6 py-3 text-gray-500">{inv.issueDate}</td>
                      <td className="px-6 py-3 text-red-700 font-medium">{inv.dueDate}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">{formatMadAmountLabel(inv.totalTTC || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total Debit</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatMadAmountLabel(totalDebit)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total Credit</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatMadAmountLabel(totalCredit)}</p>
            </div>
            <div className={`rounded-xl p-5 shadow-sm border ${totalDebit === totalCredit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-400">Equilibre</p>
              <p className={`text-2xl font-bold mt-1 ${totalDebit === totalCredit ? 'text-green-600' : 'text-red-600'}`}>
                {totalDebit === totalCredit ? 'Equilibre' : 'Desequilibre'}
              </p>
            </div>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-200">
              <h2 className="font-semibold text-gray-700 mb-4">Nouvelle ecriture comptable</h2>
              <div className="grid grid-cols-3 gap-4">
                <input value={form.date} onChange={e => setForm({...form, date: e.target.value})} type="date" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.libelle} onChange={e => setForm({...form, libelle: e.target.value})} placeholder="Libelle" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.compte} onChange={e => setForm({...form, compte: e.target.value})} placeholder="N Compte" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.debit} onChange={e => setForm({...form, debit: e.target.value})} placeholder="Debit (MAD)" type="number" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.credit} onChange={e => setForm({...form, credit: e.target.value})} placeholder="Credit (MAD)" type="number" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <div className="flex gap-2">
                  <button onClick={addEcriture} className="flex-1 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660]">Ajouter</button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">Annuler</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'historique' && (
            <EntityAuditTable entityType="accounting_entry" title="Historique — Écritures comptables" />
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ display: activeTab === 'historique' ? 'none' : undefined }}>
            <div className="flex border-b border-gray-100">
              {(['journal', 'grandlivre', 'bilan', 'historique'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium transition-all ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {tab === 'journal' ? 'Journal' : tab === 'grandlivre' ? 'Grand-livre' : tab === 'bilan' ? 'Bilan' : 'Historique'}
                </button>
              ))}
            </div>
            {ecritures.length === 0 ? (
              <ModuleEmptyState module="accounting" />
            ) : (
              <>
                <div className="p-4">
                  <GlobalTable
                    columns={journalTableColumns}
                    data={journalTableRows}
                    selectedIds={selectedJournalIds}
                    onSelectionChange={setSelectedJournalIds}
                    onShare={(ids) => {
                      const selected = filterRowsBySelectedIds(journalTableRows as unknown as Record<string, unknown>[], ids) as JournalTableRow[];
                      const summary = selected.map((row) => `- ${row.date} · ${row.libelle}: D ${row.debit} / C ${row.credit}`).join('\n');
                      openWhatsAppShare(`Journal comptable:\n${summary}`);
                    }}
                    onDownload={(ids) => {
                      const selected = filterRowsBySelectedIds(journalTableRows as unknown as Record<string, unknown>[], ids);
                      void exportTable('xlsx', selected, ECRITURE_EXPORT_COLUMNS, 'journal_comptable', { title: 'Journal Comptable' });
                    }}
                    onDelete={(ids) => {
                      void runOptimisticBulkDelete({
                        ids,
                        debugLabel: 'comptabilite-journal',
                        skipConfirm: true,
                        onOptimistic: () => {
                          setSelectedJournalIds([]);
                          setEcritures((prev) =>
                            prev.filter((e) => !ids.includes(getAccountingEntrySelectionId(e))),
                          );
                        },
                        onPersist: async (deleteIds) => {
                          const { uuidIds, localIds, skippedIds } = partitionAccountingEntryDeleteIds(deleteIds);
                          console.debug('[Comptabilité] bulk delete journal', { uuidIds, localIds, skippedIds });

                          if (uuidIds.length > 0 && isAtlasSupabaseDataEnabled()) {
                            await postBulkDelete('/api/accounting/entries/bulk-delete', uuidIds);
                          }

                          for (const localId of localIds) {
                            const result = await deleteAtlasAccountingEntryBySelectionId(localId);
                            if (!result.ok) throw new Error(result.error);
                          }

                          if (skippedIds.length > 0) {
                            showAtlasErrorToast(`${skippedIds.length} identifiant(s) ignoré(s) (format invalide).`);
                          }

                          if (uuidIds.length === 0 && localIds.length === 0) {
                            throw new Error('Aucun identifiant valide à supprimer.');
                          }
                        },
                        onRollback: () => {
                          void reloadAccountingData();
                        },
                        onPersistError: () => {
                          void reloadAccountingData();
                        },
                      });
                    }}
                    hideRowActions
                    clearSelectionOnDelete={false}
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[minmax(0,1fr)_8rem_8rem] items-center bg-gray-50 border-t border-gray-100 px-4 py-3 text-sm font-bold">
                  <span className="text-gray-600">TOTAL</span>
                  <span className="text-right text-blue-700">{formatMadAmountLabel(totalDebit)}</span>
                  <span className="text-right text-green-700">{formatMadAmountLabel(totalCredit)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}