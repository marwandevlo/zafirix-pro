'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Download, Send, ReceiptText, CheckCircle2, Wallet, AlertTriangle, Archive, History, Truck } from 'lucide-react';
import { EntityActionMenu, ConfirmDeleteDialog, EntityHistoryDrawer } from '@/app/components/actions';
import type { ActionItem } from '@/app/components/actions';
import { invoiceShareMessage, createDocumentShareLink, createFeedbackShareLink, buildFeedbackShareMessage, openWhatsAppShare } from '@/app/lib/atlas-quick-share';
import { copyTextToClipboard } from '@/app/lib/copy-to-clipboard';
import { exportInvoiceFormat } from '@/app/lib/atlas-invoice-export';
import type { ExportFormat } from '@/app/lib/atlas-export-engine';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDaysYmd, isOverdue, todayYmd } from '@/app/lib/atlas-dates';
import { deleteAtlasInvoice, atlasInvoiceErrorMessage, listAtlasInvoices, listAtlasInvoicesResult, getAtlasInvoiceById, upsertAtlasInvoice } from '@/app/lib/atlas-invoices-repository';
import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import type { AtlasPaymentTerms, AtlasPaymentTermsPreset } from '@/app/types/atlas-payment-terms';
import { normalizePaymentTerms, paymentTermsLabel } from '@/app/types/atlas-payment-terms';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { AtlasPayment } from '@/app/types/atlas-payment';
import { listAtlasPayments, upsertAtlasPayment } from '@/app/lib/atlas-payments-repository';
import { fetchAi } from '@/app/lib/fetch-ai';
import { getActiveAtlasCompany, getActiveCompanyDbRowId, resolveClientIdByName } from '@/app/lib/atlas-active-company';
import type { AtlasCompany } from '@/app/types/atlas-company';
import { createInvoicePdfDoc, downloadInvoicePdf, invoicePdfFilename } from '@/app/lib/atlas-invoice-pdf';
import {
  canCreateInvoice,
  canPerformOperation,
  incrementUsage,
  refreshAtlasUsageState,
  syncInvoiceUsageCount,
} from '@/app/lib/atlas-usage-limits';
import { TrialLimitNudgeModal } from '@/app/components/trial/TrialLimitNudgeModal';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { EmptyStateCta } from '@/app/components/ui/EmptyStateCta';
import { trackOnboardingMilestoneOnce } from '@/app/lib/atlas-onboarding-milestones';
import type { ExportColumn } from '@/app/components/ExportMenu';
import type { GlobalTableColumn } from '@/app/components/data-grid/GlobalTable';
import { exportTable } from '@/app/lib/atlas-table-export';
import { FacturesTableSection, FacturesExportMenu } from '@/app/factures/FacturesTableSection';
import { filterRowsBySelectedIds, normalizeGlobalTableRows, pruneSelectedIds, runOptimisticBulkDelete } from '@/app/components/data-grid/global-table-id';
import { EntityAuditTable } from '@/app/components/history/EntityAuditTable';
import { ModuleLoadErrorBanner } from '@/app/lib/use-enterprise-module-fetch';
import { InvoiceShipmentPanel, type InvoiceShipmentTarget } from '@/app/components/logistics/InvoiceShipmentPanel';
import type { AtlasDelivery } from '@/app/types/atlas-enterprise-modules';

const FACTURE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'numero', label: 'Numéro' },
  { key: 'client', label: 'Client' },
  { key: 'date', label: 'Date émission' },
  { key: 'echeance', label: 'Échéance' },
  { key: 'montantHT', label: 'Montant HT (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
  { key: 'tva', label: 'TVA (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
  { key: 'ttc', label: 'TTC (MAD)', format: v => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
  { key: 'paye', label: 'Payé (MAD)', format: v => typeof v === 'number' ? Math.round(v as number).toFixed(2) : String(v ?? '') },
  { key: 'reste', label: 'Reste à payer (MAD)', format: v => typeof v === 'number' ? Math.round(v as number).toFixed(2) : String(v ?? '') },
  { key: 'statut', label: 'Statut' },
  { key: 'sourceDocumentId', label: 'Source Document IA' },
];

type FactureRow = {
  id: AtlasInvoice['id'];
  numero: string;
  client: string;
  date: string;
  delai: string;
  echeance: string;
  montantHT: number;
  tva: number;
  ttc: number;
  paye: number;
  reste: number;
  statut: 'payée' | 'en attente' | 'en retard';
  sourceDocumentId?: string | null;
};

type FactureTableRow = FactureRow & { id: string };

export default function FacturesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<AtlasInvoice[]>([]);
  const [payments, setPayments] = useState<AtlasPayment[]>([]);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');
  const [activeTab, setActiveTab] = useState<'liste' | 'historique'>('liste');
  const [insight, setInsight] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
  const [limitNotice, setLimitNotice] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [limitModal, setLimitModal] = useState<{ open: boolean; variant: 'warning' | 'blocked'; title: string; desc: string }>({
    open: false,
    variant: 'warning',
    title: '',
    desc: '',
  });

  const [showForm, setShowForm] = useState(false);
  const [termsKind, setTermsKind] = useState<'30' | '60' | '90' | 'custom'>('30');
  const [termsCustomDays, setTermsCustomDays] = useState('45');
  const [form, setForm] = useState({ numero: '', client: '', date: '', montantHT: '', taux: '20' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<AtlasInvoice['id'] | null>(null);
  const [historyInvoiceId, setHistoryInvoiceId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ openFor: AtlasInvoice['id'] | null; amount: string; paidAt: string }>({
    openFor: null,
    amount: '',
    paidAt: todayYmd(),
  });
  const [deliveriesByInvoice, setDeliveriesByInvoice] = useState<Record<string, AtlasDelivery>>({});
  const [shipmentModal, setShipmentModal] = useState<InvoiceShipmentTarget | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  const resetInvoiceUiState = useCallback(() => {
    setShowForm(false);
    setForm({ numero: '', client: '', date: '', montantHT: '', taux: '20' });
    setTermsKind('30');
    setTermsCustomDays('45');
    setPaymentForm({ openFor: null, amount: '', paidAt: todayYmd() });
    setHistoryInvoiceId(null);
    setConfirmDeleteId(null);
  }, []);

  const clearUrlInvoiceId = useCallback(() => {
    if (searchParams.get('id') || searchParams.get('invoiceId')) {
      router.replace('/factures', { scroll: false });
    }
  }, [router, searchParams]);

  const loadPageData = useCallback(async () => {
    if (isAtlasSupabaseDataEnabled()) {
      await refreshAtlasUsageState();
    }

    const invResult = await listAtlasInvoicesResult();
    let list = invResult.ok ? invResult.invoices : [];

    if (!invResult.ok && invResult.error === 'auth_required') {
      setLoadError(atlasInvoiceErrorMessage(invResult.error));
    } else {
      setLoadError(null);
    }

    const urlId = (searchParams.get('id') ?? searchParams.get('invoiceId'))?.trim();
    if (urlId) {
      const inList = list.some((i) => String(i.id) === urlId);
      if (!inList) {
        const single = await getAtlasInvoiceById(urlId);
        if (single) {
          list = [...list, single];
        } else {
          resetInvoiceUiState();
          clearUrlInvoiceId();
        }
      }
    }

    setInvoices(list);
    syncInvoiceUsageCount(list.length);

    const pay = await listAtlasPayments();
    setPayments(pay);

    if (isAtlasSupabaseDataEnabled()) {
      const companyId = await getActiveCompanyDbRowId();
      setActiveCompanyId(companyId);
      if (companyId) {
        try {
          const res = await fetch(`/api/logistics/deliveries?companyId=${encodeURIComponent(companyId)}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const body = (await res.json()) as { deliveries?: AtlasDelivery[] };
            const map: Record<string, AtlasDelivery> = {};
            for (const d of body.deliveries ?? []) {
              if (d.invoiceId) map[d.invoiceId] = d;
            }
            setDeliveriesByInvoice(map);
          }
        } catch {
          setDeliveriesByInvoice({});
        }
      } else {
        setDeliveriesByInvoice({});
      }
    }
  }, [searchParams, resetInvoiceUiState, clearUrlInvoiceId]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const addFacture = async () => {
    if (!form.numero || !form.client || !form.montantHT) return;
    if (isAtlasSupabaseDataEnabled()) {
      await refreshAtlasUsageState();
      const companyId = await getActiveCompanyDbRowId();
      if (!companyId) {
        setLimitNotice('Sélectionnez une société active dans Mes sociétés pour créer une facture.');
        return;
      }
    }
    const wasEmpty = invoices.length === 0;
    const invDecision = canCreateInvoice();
    if (!invDecision.allowed) {
      setLimitNotice(invDecision.messageFr ?? invDecision.messageAr ?? '');
      setLimitModal({
        open: true,
        variant: 'blocked',
        title: 'Limite factures (essai)',
        desc: invDecision.messageFr ?? invDecision.messageAr ?? 'Passez à une offre payante pour continuer.',
      });
      return;
    }
    const opDecision = canPerformOperation();
    if (opDecision.level === 'warning' || opDecision.level === 'limit') setLimitNotice(opDecision.messageFr ?? opDecision.messageAr ?? '');

    const issueDate = form.date || todayYmd();
    const ht = Number.parseFloat(form.montantHT);
    const vatRate = (Number.parseFloat(form.taux) || 0) / 100;
    const vatAmount = ht * vatRate;
    const totalTTC = ht + vatAmount;

    const paymentTerms: AtlasPaymentTerms =
      termsKind === 'custom'
        ? { kind: 'custom', days: Number.parseInt(termsCustomDays || '0', 10) || 0 }
        : { kind: 'preset', days: Number.parseInt(termsKind, 10) as AtlasPaymentTermsPreset };

    const normalized = normalizePaymentTerms(paymentTerms);
    const dueDate = addDaysYmd(issueDate, normalized.days);

    const now = new Date().toISOString();
    const next: AtlasInvoice = {
      id: isAtlasSupabaseDataEnabled() ? crypto.randomUUID() : Date.now(),
      number: form.numero,
      clientName: form.client,
      issueDate,
      amountHT: ht,
      vatRate,
      vatAmount,
      totalTTC,
      paymentTerms: normalized,
      dueDate,
      status: 'sent',
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...invoices, next];

    if (isAtlasSupabaseDataEnabled()) {
      const companyId = await getActiveCompanyDbRowId();
      const clientId = await resolveClientIdByName(form.client, companyId);
      const res = await upsertAtlasInvoice(next, { companyId, clientId });
      if (!res.ok) {
        setLimitNotice(atlasInvoiceErrorMessage(res.error));
        return;
      }
      const inv = await listAtlasInvoices();
      setInvoices(inv);
      syncInvoiceUsageCount(inv.length);
    } else {
      setInvoices(updated);
      void upsertAtlasInvoice(next);
      syncInvoiceUsageCount(updated.length);
    }
    incrementUsage('operations', 1);
    if (wasEmpty) trackOnboardingMilestoneOnce('atlas_ms_first_invoice', 'onboarding_first_invoice_created');

    setForm({ numero: '', client: '', date: '', montantHT: '', taux: '20' });
    setTermsKind('30');
    setTermsCustomDays('45');
    setShowForm(false);
  };

  const dueDatePreview = useMemo(() => {
    const issueDate = form.date || todayYmd();
    const paymentTerms: AtlasPaymentTerms =
      termsKind === 'custom'
        ? { kind: 'custom', days: Number.parseInt(termsCustomDays || '0', 10) || 0 }
        : { kind: 'preset', days: Number.parseInt(termsKind, 10) as AtlasPaymentTermsPreset };
    const normalized = normalizePaymentTerms(paymentTerms);
    return addDaysYmd(issueDate, normalized.days);
  }, [form.date, termsKind, termsCustomDays]);

  const paymentsByInvoiceId = useMemo(() => {
    const m = new Map<string, AtlasPayment[]>();
    for (const p of payments) {
      const arr = m.get(p.invoiceId) ?? [];
      arr.push(p);
      m.set(p.invoiceId, arr);
    }
    return m;
  }, [payments]);

  const rows: FactureRow[] = useMemo(() => {
    const now = todayYmd();
    const paidForInvoice = (inv: AtlasInvoice): number => {
      const invKey = String(inv.id);
      const sum = (paymentsByInvoiceId.get(invKey) ?? []).reduce((s, p) => s + (p.paidAmount || 0), 0);
      return sum > 0 ? sum : (inv.paidAmount ?? 0);
    };
    return invoices.map((inv) => {
      const normalizedTerms = normalizePaymentTerms(inv.paymentTerms ?? { kind: 'preset', days: 30 });
      const computedDueDate = addDaysYmd(inv.issueDate, normalizedTerms.days);
      const dueDate = inv.dueDate || computedDueDate;
      const paidAmount = paidForInvoice(inv);
      const remaining = Math.max(0, (inv.totalTTC || 0) - paidAmount);
      const paid = remaining <= 0;
      const overdue = isOverdue(dueDate, paid, now) && remaining > 0;
      const statut: FactureRow['statut'] = paid ? 'payée' : overdue ? 'en retard' : 'en attente';
      return {
        id: inv.id,
        numero: inv.number,
        client: inv.clientName,
        date: inv.issueDate,
        delai: paymentTermsLabel(normalizedTerms),
        echeance: dueDate,
        montantHT: inv.amountHT,
        tva: inv.vatAmount,
        ttc: inv.totalTTC,
        paye: paidAmount,
        reste: remaining,
        statut,
        sourceDocumentId: inv.sourceDocumentId ?? null,
      };
    });
  }, [invoices, paymentsByInvoiceId]);

  const overdueUnpaid = useMemo(() => rows.filter((r) => r.statut === 'en retard'), [rows]);

  const statutColor = (s: FactureRow['statut']) => {
    if (s === 'payée') return 'bg-green-100 text-green-700';
    if (s === 'en attente') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const totals = useMemo(() => {
    const totalFacture = rows.reduce((sum, r) => sum + r.ttc, 0);
    const totalPaye = rows.reduce((sum, r) => sum + (r.paye || 0), 0);
    const totalUnpaid = rows.reduce((sum, r) => sum + (r.reste || 0), 0);
    const totalOverdue = rows.filter((r) => r.statut === 'en retard').reduce((sum, r) => sum + (r.reste || 0), 0);
    const overdueCount = rows.filter((r) => r.statut === 'en retard').length;
    return { totalFacture, totalPaye, totalUnpaid, totalOverdue, overdueCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filter === 'paid') return rows.filter((r) => r.statut === 'payée');
    if (filter === 'pending') return rows.filter((r) => r.statut === 'en attente');
    if (filter === 'overdue') return rows.filter((r) => r.statut === 'en retard');
    return rows;
  }, [filter, rows]);

  const globalTableRows = useMemo(
    (): FactureTableRow[] =>
      normalizeGlobalTableRows(filteredRows as Record<string, unknown>[]) as FactureTableRow[],
    [filteredRows],
  );

  useEffect(() => {
    setSelectedInvoiceIds((prev) => pruneSelectedIds(prev, globalTableRows));
  }, [globalTableRows]);

  const copyInvoiceSecureLink = async (r: FactureRow) => {
    if (r.sourceDocumentId) {
      const data = await createDocumentShareLink(r.sourceDocumentId, { permissions: 'download' });
      if (data.shareLink) {
        await copyTextToClipboard(data.shareLink);
        return;
      }
    }
    const summary =
      `Facture ${r.numero} · ${r.client} · ${Math.round(r.ttc).toLocaleString('fr-MA')} MAD\n` +
      `${typeof window !== 'undefined' ? window.location.origin : ''}/factures`;
    await copyTextToClipboard(summary);
  };

  const sendInvoiceFeedbackRequest = async (r: FactureRow) => {
    if (!activeCompanyId || !isAtlasSupabaseDataEnabled()) return;
    const data = await createFeedbackShareLink(activeCompanyId, {
      invoiceId: String(r.id),
      channel: 'whatsapp',
    });
    if (!data.ok || !data.item?.shareUrl) {
      throw new Error(data.error ?? 'feedback_link_failed');
    }
    const message = buildFeedbackShareMessage({
      clientName: r.client,
      subjectLabel: data.item.subjectLabel ?? `Facture ${r.numero}`,
      shareUrl: data.item.shareUrl,
    });
    openWhatsAppShare(message);
  };

  const exportInvoice = async (r: FactureRow, format: ExportFormat) => {
    const company = (await getActiveAtlasCompany()) as AtlasCompany | null;
    await exportInvoiceFormat(
      {
        numero: r.numero,
        client: r.client,
        date: r.date,
        echeance: r.echeance,
        montantHT: r.montantHT,
        tva: r.tva,
        ttc: r.ttc,
        paye: r.paye,
        reste: r.reste,
        statut: r.statut,
      },
      format,
      company,
      () => downloadPdf(r),
    );
  };

  const sendInvoiceNotificationReminder = async (r: FactureRow) => {
    const companyId = await getActiveCompanyDbRowId();
    await fetch('/api/notifications/send', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'in_app',
        category: 'invoice_reminder',
        title: `Relance facture ${r.numero}`,
        body: `${r.client} — ${Math.round(r.reste || r.ttc).toLocaleString('fr-MA')} MAD restants`,
        companyId,
        entityType: 'invoice',
        entityId: r.id,
      }),
    });
  };

  const sendReminder = (r: FactureRow) => {
    const decision = canPerformOperation();
    if (decision.level === 'warning' || decision.level === 'limit') setLimitNotice(decision.messageAr ?? '');

    const subject = `Relance facture ${r.numero} — échéance ${r.echeance}`;
    const body =
      `Bonjour,\\n\\n` +
      `Sauf erreur de notre part, la facture ${r.numero} (émise le ${r.date}) est arrivée à échéance le ${r.echeance}.\\n` +
      `Montant TTC: ${Math.round(r.ttc).toLocaleString()} MAD\\n` +
      `Reste à régler: ${Math.round(r.reste).toLocaleString()} MAD\\n\\n` +
      `Pouvez-vous nous confirmer la date de règlement ?\\n\\n` +
      `Merci d'avance,\\n` +
      `— ZAFIRIX PRO`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    incrementUsage('operations', 1);
  };

  const downloadPdf = async (r: FactureRow) => {
    const company = (await getActiveAtlasCompany()) as AtlasCompany | null;
    downloadInvoicePdf({
      company,
      invoice: {
        numero: r.numero,
        client: r.client,
        montantTtc: r.ttc,
        dateEmission: r.date,
        dateEcheance: r.echeance,
        statut: r.statut === 'en retard' ? 'En retard' : r.statut,
      },
    });
  };

  const sendInvoiceEmail = async (r: FactureRow) => {
    const decision = canPerformOperation();
    if (decision.level === 'warning' || decision.level === 'limit') setLimitNotice(decision.messageAr ?? '');

    const subject = 'Facture';
    const body =
      `Bonjour,\\n\\n` +
      `Veuillez trouver ci-joint la facture ${r.numero}.\\n` +
      `Montant TTC: ${Math.round(r.ttc).toLocaleString()} MAD\\n` +
      `Date d'échéance: ${r.echeance}\\n\\n` +
      `Merci,\\n` +
      `— ZAFIRIX PRO\\n\\n` +
      `Note: si la pièce jointe ne s'ajoute pas automatiquement, merci de télécharger le PDF depuis ZAFIRIX PRO et l'ajouter à cet email.`;

    const company = (await getActiveAtlasCompany()) as AtlasCompany | null;
    const pdfData = {
      numero: r.numero,
      client: r.client,
      montantTtc: r.ttc,
      dateEmission: r.date,
      dateEcheance: r.echeance,
      statut: r.statut === 'en retard' ? 'En retard' : r.statut,
    };

    try {
      if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
        const doc = createInvoicePdfDoc({ company, invoice: pdfData });
        const blob = doc.output('blob') as Blob;
        const file = new File([blob], invoicePdfFilename(r.numero), { type: 'application/pdf' });
        const nav = navigator as Navigator & {
          canShare?: (data: { files: File[] }) => boolean;
          share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
        };
        const canShareFiles = nav.canShare?.({ files: [file] });
        if (canShareFiles) {
          await nav.share?.({
            title: `Facture ${r.numero}`,
            text: `Facture ${r.numero} — ${Math.round(r.ttc).toLocaleString()} MAD — échéance ${r.echeance}`,
            files: [file],
          });
          return;
        }
      }
    } catch {
      // fall back to mailto
    }

    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    incrementUsage('operations', 1);
  };

  useEffect(() => {
    if (totals.overdueCount <= 0) {
      queueMicrotask(() => setInsight({ loading: false, text: '' }));
      return;
    }

    let cancelled = false;
    const run = async () => {
      setInsight({ loading: true, text: '' });
      const top = overdueUnpaid
        .slice(0, 5)
        .map((r) => `- ${r.numero} (${r.client}) · échéance ${r.echeance} · reste ${Math.round(r.reste).toLocaleString()} MAD`)
        .join('\\n');

      const fallback =
        `Vous avez ${totals.overdueCount} facture(s) en retard pour ${Math.round(totals.totalOverdue).toLocaleString()} MAD.\\n` +
        `Recommandation: relancez d’abord les 3 plus anciennes, proposez un échéancier, puis bloquez toute nouvelle livraison en cas d’absence de réponse.\\n\\n` +
        `Top retards:\\n${top}`;

      try {
        const res = await fetchAi({
          type: 'consultant',
          systemPrompt: 'Tu es un assistant comptable. Réponds en français, concis, orienté action. Pas de tableaux.',
          message:
            `Analyse les factures en retard et donne une recommandation simple.\\n` +
            `Contexte:\\n- Total en retard: ${totals.totalOverdue} MAD\\n- Nombre: ${totals.overdueCount}\\n` +
            `Factures (top):\\n${top}\\n\\n` +
            `Format attendu:\\n1) Résumé (1 phrase)\\n2) Recommandation (2-3 bullets)\\n3) Prochaine action (1 phrase)`,
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
    return () => {
      cancelled = true;
    };
  }, [overdueUnpaid, totals.overdueCount, totals.totalOverdue]);

  const addPayment = async () => {
    if (!paymentForm.openFor) return;
    const decision = canPerformOperation();
    if (decision.level === 'warning' || decision.level === 'limit') setLimitNotice(decision.messageAr ?? '');
    const invoiceId = String(paymentForm.openFor);
    const amount = Number.parseFloat(paymentForm.amount || '0') || 0;
    if (amount <= 0) return;

    const next: AtlasPayment = {
      id: crypto.randomUUID(),
      invoiceId,
      paidAmount: amount,
      paidAt: paymentForm.paidAt || todayYmd(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...payments, next];
    setPayments(updated);
    await upsertAtlasPayment(next);
    incrementUsage('operations', 1);

    setPaymentForm({ openFor: null, amount: '', paidAt: todayYmd() });
  };

  const removeInvoice = (id: AtlasInvoice['id']) => {
    const updated = invoices.filter((inv) => inv.id !== id);
    setInvoices(updated);
    void deleteAtlasInvoice(id);
    syncInvoiceUsageCount(updated.length);
  };

  const archiveInvoice = async (id: AtlasInvoice['id']) => {
    if (!isAtlasSupabaseDataEnabled()) {
      removeInvoice(id);
      return;
    }
    const res = await fetch(`/api/invoices/${String(id)}/archive`, {
      method: 'PATCH',
      credentials: 'include',
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; not_found?: boolean };
      if (body.not_found) return;
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      syncInvoiceUsageCount(Math.max(0, invoices.length - 1));
    }
  };

  const findFactureRow = useCallback(
    (id: string) => filteredRows.find((r) => String(r.id) === id),
    [filteredRows],
  );

  const facturesTableColumns = useMemo((): GlobalTableColumn<FactureTableRow>[] => [
    { header: 'رقم الفاتورة / N°', accessor: 'numero' },
    { header: 'العميل / Client', accessor: 'client' },
    { header: 'Échéance', accessor: 'echeance' },
    {
      header: 'المبلغ / TTC',
      accessor: 'ttc',
      render: (row) => `${row.ttc.toLocaleString('fr-MA')} MAD`,
    },
    {
      header: 'الحالة / Statut',
      accessor: 'statut',
      render: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statutColor(row.statut)}`}>
          {row.statut === 'en retard' ? 'En retard' : row.statut}
        </span>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'text-left',
      render: (row) => {
        const f = findFactureRow(row.id);
        if (!f) return null;
        return (
          <EntityActionMenu
            entityLabel={`Facture ${f.numero} · ${f.client}`}
            actions={[
              {
                id: 'download',
                label: 'Télécharger PDF',
                Icon: Download,
                onClick: () => void downloadPdf(f),
                dividerAfter: true,
              },
              {
                id: 'send',
                label: 'Envoyer par email',
                Icon: Send,
                onClick: () => void sendInvoiceEmail(f),
              },
              {
                id: 'shipment',
                label: deliveriesByInvoice[String(f.id)] ? 'Suivi livraison & COD' : 'Créer expédition COD',
                Icon: Truck,
                onClick: () => setShipmentModal({
                  id: String(f.id),
                  number: f.numero,
                  clientName: f.client,
                  totalTTC: f.ttc,
                  reste: f.reste,
                }),
                hidden: !isAtlasSupabaseDataEnabled() || !activeCompanyId,
                dividerAfter: true,
              },
              {
                id: 'history',
                label: 'Historique',
                Icon: History,
                onClick: () => setHistoryInvoiceId(String(f.id)),
                hidden: !isAtlasSupabaseDataEnabled(),
                dividerAfter: true,
              },
              {
                id: 'archive',
                label: 'Archiver',
                Icon: Archive,
                onClick: () => void archiveInvoice(f.id),
                variant: 'warning',
                hidden: !isAtlasSupabaseDataEnabled(),
              },
              {
                id: 'delete',
                label: 'Supprimer',
                Icon: Trash2,
                onClick: () => setConfirmDeleteId(f.id),
                variant: 'danger',
              },
            ] satisfies ActionItem[]}
          />
        );
      },
    },
  ], [activeCompanyId, deliveriesByInvoice, findFactureRow]);

  const handleBulkModify = useCallback((ids: string[]) => {
    if (ids.length === 1) {
      const row = findFactureRow(ids[0]!);
      if (row && row.reste > 0) {
        setPaymentForm({ openFor: row.id, amount: String(Math.round(row.reste)), paidAt: todayYmd() });
        return;
      }
    }
    window.alert(`${ids.length} facture(s) — modification groupée bientôt disponible.`);
  }, [findFactureRow]);

  const handleBulkShare = useCallback((ids: string[]) => {
    const selected = filterRowsBySelectedIds(filteredRows as Record<string, unknown>[], ids) as typeof filteredRows;
    const text = selected
      .map((r) => `- ${r.numero} · ${r.client}: ${Math.round(r.ttc).toLocaleString('fr-MA')} MAD (${r.statut})`)
      .join('\n');
    openWhatsAppShare(`Factures sélectionnées — Zafirix Pro:\n${text}`);
  }, [filteredRows]);

  const handleBulkDownload = useCallback(async (ids: string[]) => {
    const selected = filterRowsBySelectedIds(filteredRows as Record<string, unknown>[], ids);
    try {
      await exportTable(
        'xlsx',
        selected as unknown as Record<string, unknown>[],
        FACTURE_EXPORT_COLUMNS,
        'factures-selection',
        { title: 'Factures sélectionnées', selectedRows: selected.length },
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Export impossible');
    }
  }, [filteredRows]);

  const handleBulkDelete = useCallback((ids: string[]) => {
    runOptimisticBulkDelete({
      ids,
      onOptimistic: () => {
        setSelectedInvoiceIds([]);
        setInvoices((prev) => {
          const next = prev.filter((inv) => !ids.includes(String(inv.id)));
          syncInvoiceUsageCount(next.length);
          return next;
        });
      },
      onPersist: async (deleteIds) => {
        await Promise.all(deleteIds.map((id) => deleteAtlasInvoice(id as AtlasInvoice['id'])));
      },
      onPersistError: () => {
        void loadPageData();
      },
    });
  }, [loadPageData]);

  return (
    <div className="flex h-screen bg-gray-50">
      <TrialLimitNudgeModal
        open={limitModal.open}
        variant={limitModal.variant}
        title={limitModal.title}
        description={limitModal.desc}
        onClose={() => setLimitModal((m) => ({ ...m, open: false }))}
        onUpgrade={() => {
          setLimitModal((m) => ({ ...m, open: false }));
          router.push('/pricing?plan=pro');
        }}
      />
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Factures</h1>
            <p className="text-xs text-gray-400 mt-0.5">Gestion des factures clients</p>
          </div>
          <button
            onClick={() => {
              const d = canCreateInvoice();
              if (!d.allowed) {
                setLimitNotice(d.messageFr ?? d.messageAr ?? '');
                setLimitModal({
                  open: true,
                  variant: 'blocked',
                  title: 'Limite factures atteinte',
                  desc: d.messageFr ?? d.messageAr ?? 'Mettez à niveau votre offre pour créer plus de factures.',
                });
                return;
              }
              if (d.level === 'warning' && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('zafirix_invoice_warn_modal')) {
                sessionStorage.setItem('zafirix_invoice_warn_modal', '1');
                setLimitModal({
                  open: true,
                  variant: 'warning',
                  title: 'Vous approchez de la limite',
                  desc: d.messageFr ?? d.messageAr ?? '',
                });
              }
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors"
          >
            <Plus size={16} /> Nouvelle facture
          </button>
        </header>

        <div className="shrink-0 px-8 pt-4">
          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
        </div>

        <div className="shrink-0 px-8 pt-6 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500">Total facturé</p>
                  <p className="text-2xl font-semibold text-blue-700 mt-1 tracking-tight">{totals.totalFacture.toLocaleString()} MAD</p>
                </div>
                <div className="shrink-0 rounded-xl bg-blue-50 border border-blue-100 p-2.5 text-blue-700">
                  <ReceiptText size={18} />
                </div>
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-blue-50">
                <div className="h-1 rounded-full bg-blue-400 w-1/2" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500">Total payé</p>
                  <p className="text-2xl font-semibold text-green-700 mt-1 tracking-tight">{totals.totalPaye.toLocaleString()} MAD</p>
                </div>
                <div className="shrink-0 rounded-xl bg-green-50 border border-green-100 p-2.5 text-green-700">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-green-50">
                <div className="h-1 rounded-full bg-green-400 w-1/2" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500">Reste à encaisser</p>
                  <p className="text-2xl font-semibold text-orange-700 mt-1 tracking-tight">{totals.totalUnpaid.toLocaleString()} MAD</p>
                </div>
                <div className="shrink-0 rounded-xl bg-orange-50 border border-orange-100 p-2.5 text-orange-700">
                  <Wallet size={18} />
                </div>
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-orange-50">
                <div className="h-1 rounded-full bg-orange-400 w-1/2" />
              </div>
            </div>
            <div className={`bg-white rounded-2xl p-5 shadow-sm border ${totals.totalOverdue > 0 ? 'border-red-200' : 'border-gray-100'} hover:shadow-md transition-shadow`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500">En retard</p>
                  <p className={`text-2xl font-semibold mt-1 tracking-tight ${totals.totalOverdue > 0 ? 'text-red-700' : 'text-gray-800'}`}>{totals.totalOverdue.toLocaleString()} MAD</p>
                </div>
                <div className={`shrink-0 rounded-xl border p-2.5 ${totals.totalOverdue > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                  <AlertTriangle size={18} />
                </div>
              </div>
              <div className={`mt-3 h-1 w-full rounded-full ${totals.totalOverdue > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className={`h-1 rounded-full w-1/2 ${totals.totalOverdue > 0 ? 'bg-red-400' : 'bg-gray-300'}`} />
              </div>
            </div>
          </div>
          {limitNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              {limitNotice}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-6 pt-6 space-y-6">

          {totals.overdueCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <span className="font-semibold">Alerte paiements :</span> {totals.overdueCount} facture(s) en retard — {totals.totalOverdue.toLocaleString()} MAD.
            </div>
          )}

          {totals.overdueCount > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Insight IA</p>
                  <p className="text-xs text-gray-400">Résumé et recommandation sur les retards</p>
                </div>
                {insight.loading && <p className="text-xs text-gray-400">Analyse…</p>}
              </div>
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap wrap-break-word">{insight.text}</pre>
              </div>
            </div>
          )}

          {overdueUnpaid.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 text-sm">Factures impayées en retard</h2>
                <span className="text-xs text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                  {overdueUnpaid.length} en retard
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3">Numéro</th>
                    <th className="px-6 py-3">Client</th>
                    <th className="px-6 py-3">Date émission</th>
                    <th className="px-6 py-3">Date échéance</th>
                    <th className="px-6 py-3 text-right">TTC</th>
                    <th className="px-6 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {overdueUnpaid.map((f) => (
                    <tr key={f.id} className="border-b border-red-50 bg-red-50/30 hover:bg-red-50/50">
                      <td className="px-6 py-3 font-medium text-gray-700">
                        <div className="flex items-center gap-2">
                          <span>{f.numero}</span>
                          <span className="text-[10px] uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                            En retard
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{f.client}</td>
                      <td className="px-6 py-3 text-gray-500">{f.date}</td>
                      <td className="px-6 py-3 text-red-700 font-medium">{f.echeance}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">{f.ttc.toLocaleString()} MAD</td>
                      <td className="px-6 py-3 text-right">
                        <button onClick={() => sendReminder(f)} className="text-xs font-semibold text-red-700 hover:text-red-800">
                          Relancer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-200">
              <h2 className="font-semibold text-gray-700 mb-4">Nouvelle facture</h2>
              <div className="grid grid-cols-2 gap-4">
                <input value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} placeholder="Numéro (ex: F-2026-004)" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.client} onChange={e => setForm({...form, client: e.target.value})} placeholder="Nom du client" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date émission</label>
                  <input value={form.date} onChange={e => setForm({...form, date: e.target.value})} type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                </div>
                <input value={form.montantHT} onChange={e => setForm({...form, montantHT: e.target.value})} placeholder="Montant HT (MAD)" type="number" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Délai de paiement</label>
                  <div className="flex gap-2">
                    <select
                      value={termsKind}
                      onChange={(e) => setTermsKind(e.target.value as '30' | '60' | '90' | 'custom')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                      <option value="30">30 jours</option>
                      <option value="60">60 jours</option>
                      <option value="90">90 jours</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                    {termsKind === 'custom' && (
                      <input
                        value={termsCustomDays}
                        onChange={e => setTermsCustomDays(e.target.value)}
                        placeholder="Jours"
                        type="number"
                        min={0}
                        className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date échéance</label>
                  <input
                    value={dueDatePreview}
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
                <select value={form.taux} onChange={e => setForm({...form, taux: e.target.value})} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                  <option value="20">TVA 20%</option>
                  <option value="14">TVA 14%</option>
                  <option value="10">TVA 10%</option>
                  <option value="7">TVA 7%</option>
                  <option value="0">Exonéré</option>
                </select>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void addFacture()} className="flex-1 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors">Créer</button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
                </div>
              </div>
            </div>
          )}

          <>
          {activeTab === 'historique' && (
            <EntityAuditTable entityType="invoice" title="Historique — Factures clients" />
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto" style={{ display: activeTab === 'historique' ? 'none' : undefined }}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-gray-700">Liste des factures</p>
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                  {(['liste', 'historique'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setActiveTab(t)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {t === 'liste' ? 'Liste' : 'Historique'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FacturesExportMenu
                  data={filteredRows as unknown as Record<string, unknown>[]}
                  columns={FACTURE_EXPORT_COLUMNS}
                  selectedIds={selectedInvoiceIds}
                  filters={{ statut: filter }}
                />
                <button onClick={() => setFilter('all')} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${filter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  Toutes
                </button>
                <button onClick={() => setFilter('paid')} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${filter === 'paid' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  Payées
                </button>
                <button onClick={() => setFilter('pending')} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${filter === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  En attente
                </button>
                <button onClick={() => setFilter('overdue')} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${filter === 'overdue' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  En retard
                </button>
              </div>
            </div>
            <div className="p-4">
              <FacturesTableSection
                tableData={globalTableRows}
                exportData={filteredRows as unknown as Record<string, unknown>[]}
                columns={facturesTableColumns}
                exportColumns={FACTURE_EXPORT_COLUMNS}
                selectedIds={selectedInvoiceIds}
                onSelectionChange={setSelectedInvoiceIds}
                onModify={handleBulkModify}
                onShare={handleBulkShare}
                onDownload={handleBulkDownload}
                onDelete={handleBulkDelete}
                exportFilters={{ statut: filter }}
                showExportMenu={false}
                emptyState={
                  <EmptyStateCta
                    lang="fr"
                    title="Aucune facture"
                    description="Créez votre première facture client pour suivre encaissements et relances."
                    primaryLabelFr="Ajouter maintenant"
                    primaryLabelAr="ابدأ الآن"
                    onPrimary={() => setShowForm(true)}
                  />
                }
              />
            </div>
          </div>
          </>

          {paymentForm.openFor !== null && (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-emerald-200">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Ajouter un paiement</p>
                  <p className="text-xs text-gray-400">Confirmation explicite avant exécution (paiement ajouté uniquement après validation)</p>
                </div>
                <button onClick={() => setPaymentForm({ openFor: null, amount: '', paidAt: todayYmd() })} className="text-xs text-gray-400 hover:text-gray-600">
                  Fermer
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Montant payé (MAD)</label>
                  <input value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} type="number" min={0} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date de paiement</label>
                  <input value={paymentForm.paidAt} onChange={(e) => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400" />
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={() => void addPayment()} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors">
                    Confirmer
                  </button>
                  <button onClick={() => setPaymentForm({ openFor: null, amount: '', paidAt: todayYmd() })} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Confirm delete/archive dialog */}
      <ConfirmDeleteDialog
        open={confirmDeleteId !== null}
        entityName={(() => {
          const inv = invoices.find(i => i.id === confirmDeleteId);
          return inv ? `Facture ${inv.number} · ${inv.clientName}` : 'cette facture';
        })()}
        entityType="cette facture"
        showArchiveOption={isAtlasSupabaseDataEnabled()}
        onConfirmDelete={() => {
          if (confirmDeleteId !== null) removeInvoice(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onConfirmArchive={isAtlasSupabaseDataEnabled() ? () => {
          if (confirmDeleteId !== null) void archiveInvoice(confirmDeleteId);
          setConfirmDeleteId(null);
        } : undefined}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* History drawer */}
      <EntityHistoryDrawer
        open={historyInvoiceId !== null}
        entityId={historyInvoiceId ?? ''}
        entityType="invoice"
        entityLabel={(() => {
          const inv = invoices.find(i => String(i.id) === historyInvoiceId);
          return inv ? `Facture ${inv.number} · ${inv.clientName}` : 'Facture';
        })()}
        onClose={() => setHistoryInvoiceId(null)}
      />

      {activeCompanyId && shipmentModal && (
        <InvoiceShipmentPanel
          open={!!shipmentModal}
          onClose={() => setShipmentModal(null)}
          companyId={activeCompanyId}
          invoice={shipmentModal}
          existingDelivery={deliveriesByInvoice[shipmentModal.id] ?? null}
          onSaved={() => void loadPageData()}
        />
      )}
    </div>
  );
}