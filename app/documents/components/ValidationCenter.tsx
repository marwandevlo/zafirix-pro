'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Edit3,
  Send,
  ChevronDown,
  ChevronUp,
  X,
  RotateCcw,
  Archive,
  BookOpen,
  Receipt,
  ExternalLink,
  Zap,
  CheckCheck,
  Ban,
} from 'lucide-react';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import type { AtlasDocument, AtlasExtractedField, AtlasStructuredExtraction } from '@/app/types/atlas-document';
import {
  classificationFromDocument,
  structuredExtractionFromDocument,
  validationStatusFromDocument,
  ocrInvoicesFromDocument,
  bankTransactionsFromDocument,
} from '@/app/lib/atlas-documents-repository';
import { creatableOcrInvoices } from '@/app/lib/atlas-ocr-invoices-detect';
import type { AtlasOcrDetectedInvoice } from '@/app/types/atlas-document';
import { isBankStatementType, extractionFieldKeysForType } from '@/app/lib/atlas-document-type-utils';
import {
  confidenceColor,
  confidenceLabel,
  documentTypeLabel,
  getRoutingSuggestions,
  isConfidentEnoughToRoute,
  STRICT_CONFIDENCE_MODULES,
} from '@/app/lib/atlas-document-routing';
import { RoutingCompletenessAlert } from '@/app/components/validation/RoutingCompletenessAlert';
import { TvaConsistencyAlert } from '@/app/components/validation/TvaConsistencyAlert';

// ── Types ─────────────────────────────────────────────────────────────────────

type RoutingResult = {
  module: string;
  invoiceId?: string;
  legalDocId?: string;
  journalLineCount?: number;
  tvaAmount?: number | null;
  tvaSuggestionId?: string | null;
  note?: string;
  amountTtc?: number | null;
};

type DuplicateWarning = {
  module: string;
  label: string;
  existingEntityId: string | null;
  routedAt: string | null;
};

type ValidationCenterProps = {
  document: AtlasDocument;
  onClose: () => void;
  onValidated: () => void;
  onRetryOcr: (documentId: string) => void;
};

type CorrectionState = {
  fieldName: string;
  currentValue: string;
  newValue: string;
  transactionIndex?: number;
  transactionField?: string;
};

// ── Field display helpers ─────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  supplier_name: 'Fournisseur',
  supplier_ice: 'ICE Fournisseur',
  supplier_if: 'IF Fournisseur',
  supplier_rc: 'RC Fournisseur',
  supplier_address: 'Adresse fournisseur',
  customer_name: 'Client',
  customer_ice: 'ICE Client',
  invoice_number: 'Numéro de facture',
  invoice_date: 'Date de facture',
  due_date: 'Date d\'échéance',
  currency: 'Devise',
  subtotal_ht: 'Montant HT',
  tva_rate: 'Taux TVA (%)',
  tva_amount: 'Montant TVA',
  total_ttc: 'Total TTC',
  payment_method: 'Mode de paiement',
  category_suggestion: 'Catégorie suggérée',
  accounting_account: 'Compte comptable',
  bank_name: 'Banque',
  account_number: 'N° de compte',
  statement_period: 'Période',
  opening_balance: 'Solde ouverture',
  closing_balance: 'Solde clôture',
  employee_name: 'Employé',
  period: 'Période de paie',
  gross_salary: 'Salaire brut',
  net_salary: 'Salaire net',
  cnss_amount: 'CNSS',
  ir_amount: 'IR',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
}

function fieldValueDisplay(field: AtlasExtractedField): string {
  const v = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  if (v == null || v === '') return '—';
  return String(v);
}

function isAmountField(key: string): boolean {
  return ['subtotal_ht', 'tva_amount', 'total_ttc', 'opening_balance', 'closing_balance', 'gross_salary', 'net_salary', 'cnss_amount', 'ir_amount'].includes(key);
}

function formatAmount(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2 });
}

function transactionCellValue(row: Record<string, unknown>, key: string): string {
  const v = row[key] ?? row[key === 'description' ? 'label' : key] ?? row[key === 'transaction_date' ? 'date' : key];
  if (v == null || v === '') return '—';
  if (key === 'debit' || key === 'credit' || key === 'balance') return formatAmount(v);
  return String(v);
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${confidenceColor(score)}`}>
      {Math.round(score * 100)}% · {confidenceLabel(score)}
    </span>
  );
}

// ── Correction modal ──────────────────────────────────────────────────────────

function CorrectionModal({
  correction,
  onSave,
  onCancel,
}: {
  correction: CorrectionState;
  onSave: (newValue: string, reason: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(correction.newValue || correction.currentValue);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    onSave(value, reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Corriger — {fieldLabel(correction.fieldName)}</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Valeur actuelle (IA)</label>
            <div className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              {correction.currentValue || '—'}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-900 block mb-1">Nouvelle valeur *</label>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none"
              placeholder="Valeur corrigée…"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Raison (optionnel)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
              placeholder="Ex. montant lu avec décimale incorrecte…"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="flex-1 px-4 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la correction'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ValidationApiDetail = {
  page?: number;
  invoice_number?: string;
  missing?: string[];
  error?: string;
};

export function ValidationCenter({ document, onClose, onValidated, onRetryOcr }: ValidationCenterProps) {
  const router = useRouter();
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [validating, setValidating] = useState(false);
  const [localValidationStatus, setLocalValidationStatus] = useState<string | null>(null);
  const [routing, setRouting] = useState<string | null>(null);
  const [routingAll, setRoutingAll] = useState(false);
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);
  const [routedModules, setRoutedModules] = useState<string[]>(() => {
    const meta = (document as unknown as Record<string, unknown>).metadata;
    if (!meta || typeof meta !== 'object') return [];
    const routed = (meta as Record<string, unknown>).routed_to;
    return Array.isArray(routed) ? (routed as string[]) : [];
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showLineItems, setShowLineItems] = useState(false);

  const classification = classificationFromDocument(document);
  const extraction = structuredExtractionFromDocument(document);
  const validationStatus = localValidationStatus ?? validationStatusFromDocument(document);
  const isBankStatement = isBankStatementType(classification?.detected_type);
  const bankTransactions = useMemo(
    () => (isBankStatement ? bankTransactionsFromDocument(document) : []),
    [document, isBankStatement],
  );
  const allowedFieldKeys = extractionFieldKeysForType(classification?.detected_type ?? null);

  const detectedInvoices = useMemo(
    () => creatableOcrInvoices(ocrInvoicesFromDocument(document)),
    [document],
  );
  const isMultiInvoice = detectedInvoices.length > 1;
  const classificationConfirmed = Boolean(classification?.detected_type && classification.detected_type !== 'unknown');

  const routingSuggestions = classification?.detected_type
    ? getRoutingSuggestions(classification.detected_type)
    : [];

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const formatValidationError = (body: {
    message?: string;
    error?: string;
    details?: ValidationApiDetail[];
  }): string => {
    const parts: string[] = [];
    if (body.message) parts.push(body.message);
    for (const detail of body.details ?? []) {
      const label = detail.invoice_number
        ? `Facture ${detail.invoice_number}`
        : detail.page
          ? `Page ${detail.page}`
          : 'Facture';
      if (detail.missing?.length) {
        parts.push(`${label}: champs manquants (${detail.missing.join(', ')})`);
      } else if (detail.error) {
        parts.push(`${label}: ${detail.error}`);
      }
    }
    return parts.join(' · ') || body.error || 'Erreur lors de la validation.';
  };

  const handleValidate = useCallback(async (action: 'validated' | 'rejected' | 'needs_correction') => {
    setValidating(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        details?: ValidationApiDetail[];
        invoicesCreated?: number;
        invoicesSkipped?: number;
        journalLineCount?: number;
        tvaAmount?: number;
        documentKind?: 'invoice' | 'bank_statement';
        statementId?: string;
        transactionCount?: number;
      };

      if (!res.ok) {
        console.error('[ValidationCenter] validate failed', body);
        showMessage('error', formatValidationError(body));
        return;
      }

      setLocalValidationStatus(action);

      if (action === 'validated') {
        if (body.documentKind === 'bank_statement') {
          const count = body.transactionCount ?? 0;
          showMessage(
            'success',
            count > 0
              ? `Relevé bancaire validé — ${count} opération(s) importée(s).`
              : 'Relevé bancaire validé.',
          );
        } else {
          const created = body.invoicesCreated ?? 0;
          const skipped = body.invoicesSkipped ?? 0;
          const journal = body.journalLineCount ?? 0;
          const tva = body.tvaAmount ?? 0;
          let successMsg = created > 1
            ? `Document validé — ${created} factures enregistrées.`
            : created === 1
              ? 'Document validé — facture enregistrée.'
              : 'Document validé.';
          if (skipped > 0) successMsg += ` ${skipped} page(s) ignorée(s) (données incomplètes).`;
          if (journal > 0) successMsg += ` ${journal} écriture(s) comptable(s).`;
          if (tva > 0) {
            successMsg += ` TVA: ${tva.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD.`;
          }
          showMessage('success', successMsg);
        }
      } else {
        showMessage(
          'success',
          action === 'rejected' ? 'Document rejeté.' : 'Marqué à corriger.',
        );
      }

      router.refresh();
      onValidated();
    } catch {
      showMessage('error', 'Erreur réseau. Réessayez.');
    } finally {
      setValidating(false);
    }
  }, [document.id, onValidated, router]);

  const handleSaveCorrection = useCallback(async (
    fieldName: string,
    oldValue: string,
    newValue: string,
    reason: string,
    sourcePage?: number,
    confidenceBefore?: number,
    transactionIndex?: number,
    transactionField?: string,
  ) => {
    try {
      const res = await fetch(`/api/documents/${document.id}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fieldName,
          oldValue,
          newValue,
          correctionReason: reason,
          sourcePage,
          confidenceBefore,
          transactionIndex,
          transactionField,
        }),
      });
      if (!res.ok) {
        showMessage('error', 'Échec de l\'enregistrement de la correction.');
        return;
      }
      showMessage('success', `Correction enregistrée pour "${fieldLabel(fieldName)}".`);
      setCorrection(null);
      onValidated();
    } catch {
      showMessage('error', 'Erreur réseau. Réessayez.');
    }
  }, [document.id, onValidated]);

  const handleRouteTo = useCallback(async (module: string, label: string): Promise<boolean> => {
    setRouting(module);
    setDuplicateWarning(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/route-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ module }),
      });
      const data = await res.json().catch(() => ({})) as RoutingResult & { ok?: boolean; duplicate?: boolean; existingEntityId?: string | null; routedAt?: string | null; message?: string };

      if (data.duplicate) {
        setDuplicateWarning({ module, label, existingEntityId: data.existingEntityId ?? null, routedAt: data.routedAt ?? null });
        return false;
      }

      if (!res.ok) {
        showMessage('error', data.message ?? `Échec de l'envoi vers ${label}.`);
        return false;
      }

      setRoutingResult(data);
      setRoutedModules(prev => [...new Set([...prev, module])]);

      const journalCount = data.journalLineCount ?? 0;
      const tvaAmt = data.tvaAmount;
      let successMsg = `Envoyé vers ${label}.`;
      if (journalCount > 0) successMsg += ` ${journalCount} écritures créées.`;
      if (tvaAmt != null && tvaAmt > 0) successMsg += ` TVA: ${tvaAmt.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD.`;
      showMessage('success', successMsg);
      onValidated();
      return true;
    } catch {
      showMessage('error', 'Erreur réseau. Réessayez.');
      return false;
    } finally {
      setRouting(null);
    }
  }, [document.id, onValidated]);

  const handleRouteAll = useCallback(async () => {
    setRoutingAll(true);
    let sent = 0;
    for (const suggestion of routingSuggestions) {
      if (routedModules.includes(suggestion.module)) continue;
      if (suggestion.action === 'view_only') continue;
      await handleRouteTo(suggestion.module, suggestion.label);
      sent++;
    }
    if (sent === 0) showMessage('error', 'Tous les modules ont déjà reçu ce document.');
    setRoutingAll(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingSuggestions, routedModules, handleRouteTo]);

  const visibleFields = extraction
    ? Object.entries(extraction).filter(([key, field]) => {
        if (key === 'line_items') return false;
        if (allowedFieldKeys && !allowedFieldKeys.has(key)) return false;
        if (!field || typeof field !== 'object') return false;
        const f = field as AtlasExtractedField;
        return f.value != null || (f.user_corrected_value != null);
      })
    : [];

  const lineItems = !isBankStatement && Array.isArray(extraction?.line_items) ? extraction!.line_items : [];

  const canValidateDocument = isBankStatement
    ? classificationConfirmed
    : classificationConfirmed || visibleFields.length > 0 || detectedInvoices.length > 0;

  const statusColors: Record<string, string> = {
    pending_review: 'bg-amber-50 border-amber-200 text-amber-700',
    validated: 'bg-green-50 border-green-200 text-green-700',
    rejected: 'bg-red-50 border-red-200 text-red-700',
    needs_correction: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  const statusLabels: Record<string, string> = {
    pending_review: 'En attente de validation',
    validated: 'Validé',
    rejected: 'Rejeté',
    needs_correction: 'À corriger',
  };

  return (
    <>
      {correction && (
        <CorrectionModal
          correction={correction}
          onSave={(newValue, reason) => {
            const field = extraction?.[correction.fieldName as keyof AtlasStructuredExtraction] as AtlasExtractedField | undefined;
            void handleSaveCorrection(
              correction.fieldName,
              correction.currentValue,
              newValue,
              reason,
              field?.source_page,
              field?.confidence,
              correction.transactionIndex,
              correction.transactionField,
            );
          }}
          onCancel={() => setCorrection(null)}
        />
      )}

      <div className="flex flex-col h-full bg-white border-l border-gray-200 w-full max-w-xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 truncate">{document.filename ?? document.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {document.sizeBytes ? `${(document.sizeBytes / 1024).toFixed(0)} Ko` : ''}
              {document.createdAt ? ` · ${new Date(document.createdAt).toLocaleDateString('fr-FR')}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-3 text-gray-400 hover:text-gray-700 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Flash message */}
        {message && (
          <div className={`mx-4 mt-3 px-4 py-2 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Classification */}
          {classification && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Classification</h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Type détecté</span>
                  <span className="text-sm font-bold text-gray-900">{documentTypeLabel(classification.detected_type)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Confiance</span>
                  <ConfidenceBadge score={classification.type_confidence} />
                </div>
                {classification.classification_reason && (
                  <div>
                    <span className="text-xs text-gray-400 block">Pourquoi :</span>
                    <p className="text-xs text-gray-600 mt-0.5">{classification.classification_reason}</p>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Langue</span>
                  <span className="font-medium text-gray-700 uppercase">{classification.detected_language}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Devise</span>
                  <span className="font-medium text-gray-700">{classification.detected_currency}</span>
                </div>
                {classification.type_confidence < 0.85 && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700">Confiance faible — vérifiez le type détecté avant de valider.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Validation status */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Statut</h3>
            <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${statusColors[validationStatus] ?? 'bg-gray-50 border-gray-200 text-gray-600'}`}>
              {statusLabels[validationStatus] ?? validationStatus}
            </div>
          </section>

          {/* Multi-invoice pages detected */}
          {!isBankStatement && isMultiInvoice && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Factures détectées ({detectedInvoices.length})
              </h3>
              <div className="space-y-2">
                {detectedInvoices.map((inv: AtlasOcrDetectedInvoice) => (
                  <div
                    key={`${inv.page_number}-${inv.invoice_number ?? 'page'}`}
                    className="px-3 py-2.5 rounded-lg border border-emerald-100 bg-emerald-50/60 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-900">
                        Page {inv.page_number}
                        {inv.invoice_number ? ` · ${inv.invoice_number}` : ''}
                      </span>
                      {inv.amount_ttc != null && (
                        <span className="font-medium text-emerald-800">
                          {inv.amount_ttc.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                        </span>
                      )}
                    </div>
                    <div className="text-emerald-700 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {inv.supplier_name && <span>{inv.supplier_name}</span>}
                      {inv.amount_ht != null && <span>HT: {inv.amount_ht.toLocaleString('fr-MA')} MAD</span>}
                      {inv.vat_amount != null && <span>TVA: {inv.vat_amount.toLocaleString('fr-MA')} MAD</span>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                La validation enregistrera chaque facture détectée (comptabilité + TVA).
              </p>
            </section>
          )}

          {/* Bank transactions */}
          {isBankStatement && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Opérations bancaires ({bankTransactions.length})
              </h3>
              {bankTransactions.length === 0 ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Aucune opération extraite — vérifiez les champs banque / période ou relancez l&apos;OCR.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-left">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Libellé</th>
                        <th className="px-3 py-2 text-right">Débit</th>
                        <th className="px-3 py-2 text-right">Crédit</th>
                        <th className="px-3 py-2 text-right">Solde</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankTransactions.map((row, index) => (
                        <tr key={index} className="border-t border-gray-50 group hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {transactionCellValue(row, 'transaction_date')}
                          </td>
                          <td className="px-3 py-2 text-gray-800">
                            {transactionCellValue(row, 'description')}
                          </td>
                          <td className="px-3 py-2 text-right text-red-600">
                            {transactionCellValue(row, 'debit')}
                          </td>
                          <td className="px-3 py-2 text-right text-green-700">
                            {transactionCellValue(row, 'credit')}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {transactionCellValue(row, 'balance')}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setCorrection({
                                fieldName: `transaction_${index}_description`,
                                currentValue: transactionCellValue(row, 'description'),
                                newValue: transactionCellValue(row, 'description'),
                                transactionIndex: index,
                                transactionField: 'description',
                              })}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-600"
                              title="Corriger le libellé"
                            >
                              <Edit3 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Extracted fields */}
          {visibleFields.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Champs extraits</h3>
                <ExportMenu
                  data={visibleFields.map(([key, rawField]) => {
                    const f = rawField as { value?: unknown; user_corrected_value?: unknown; confidence?: number; source_page?: number };
                    return {
                      champ: key,
                      label: fieldLabel(key),
                      valeur_ia: f.value != null ? String(f.value) : '',
                      valeur_corrigee: f.user_corrected_value != null ? String(f.user_corrected_value) : '',
                      confiance: f.confidence ?? null,
                      page_source: f.source_page ?? null,
                      source_document_id: document.id ?? '',
                    };
                  })}
                  columns={[
                    { key: 'label', label: 'Champ' },
                    { key: 'valeur_ia', label: 'Valeur IA' },
                    { key: 'valeur_corrigee', label: 'Valeur corrigée' },
                    { key: 'confiance', label: 'Confiance', format: v => v != null ? `${Math.round((v as number) * 100)}%` : '' },
                    { key: 'page_source', label: 'Page source', format: v => v != null ? String(v) : '' },
                    { key: 'source_document_id', label: 'ID Document' },
                  ] as ExportColumn[]}
                  filename={`champs_extraits_${String(document.id ?? 'doc')}`}
                  title={`Champs extraits — ${document.filename ?? document.title ?? 'Document'}`}
                  size="xs"
                  align="right"
                />
              </div>
              <div className="space-y-2">
                {visibleFields.map(([key, rawField]) => {
                  const field = rawField as AtlasExtractedField;
                  const isCorrected = field.user_corrected_value != null;
                  const displayVal = fieldValueDisplay(field);
                  return (
                    <div
                      key={key}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${isCorrected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'} group hover:border-gray-200`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-500">{fieldLabel(key)}</span>
                          {field.source_page && (
                            <span className="text-xs text-gray-400">p.{field.source_page}</span>
                          )}
                          {isCorrected && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">Corrigé</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-sm font-semibold ${displayVal === '—' ? 'text-gray-300' : 'text-gray-900'}`}>
                            {displayVal}
                            {isAmountField(key) && displayVal !== '—' ? ' MAD' : ''}
                          </span>
                          <ConfidenceBadge score={field.confidence} />
                        </div>
                        {isCorrected && field.value != null && (
                          <p className="text-xs text-gray-400 mt-0.5">IA: {String(field.value)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCorrection({
                          fieldName: key,
                          currentValue: fieldValueDisplay(field),
                          newValue: fieldValueDisplay(field),
                        })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-rose-600 shrink-0 mt-1"
                        title="Corriger"
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Line items */}
              {lineItems.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowLineItems(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    {showLineItems ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {lineItems.length} ligne{lineItems.length > 1 ? 's' : ''} de détail
                  </button>
                  {showLineItems && (
                    <div className="mt-2 space-y-1.5">
                      {lineItems.map((item, i) => (
                        <div key={i} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                          <div className="font-medium text-gray-800">{item.description}</div>
                          <div className="text-gray-500 mt-0.5 flex gap-3">
                            {item.quantity != null && <span>Qté: {item.quantity}</span>}
                            {item.unit_price != null && <span>PU: {item.unit_price} MAD</span>}
                            {item.total_ht != null && <span>HT: {item.total_ht} MAD</span>}
                            {item.tva_rate != null && <span>TVA: {item.tva_rate}%</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Post-routing confirmation */}
          {routingResult && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dernier envoi</h3>
              <div className="space-y-2">
                {routingResult.invoiceId && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                    <Receipt size={16} className="text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800">Facture fournisseur créée</p>
                      <p className="text-xs text-green-600 font-mono truncate">#{routingResult.invoiceId.slice(0, 12)}…</p>
                    </div>
                    <a href="/comptabilite" className="text-green-600 hover:text-green-700 shrink-0">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
                {(routingResult.journalLineCount ?? 0) > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <BookOpen size={16} className="text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-800">{routingResult.journalLineCount} écritures comptables (brouillon)</p>
                      <p className="text-xs text-blue-600">Débit charges + TVA déductible · Crédit fournisseur</p>
                    </div>
                    <a href="/comptabilite" className="text-blue-600 hover:text-blue-700 shrink-0">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
                {routingResult.tvaAmount != null && routingResult.tvaAmount > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                    <Receipt size={16} className="text-indigo-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-800">TVA déductible enregistrée</p>
                      <p className="text-xs text-indigo-600 font-medium">
                        {routingResult.tvaAmount.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                      </p>
                    </div>
                    <a href="/tva" className="text-indigo-600 hover:text-indigo-700 shrink-0">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TVA Consistency Alert — invoices only */}
          {!isBankStatement && extraction && (
            <TvaConsistencyAlert
              amountHt={
                extraction.subtotal_ht?.user_corrected_value != null
                  ? parseFloat(String(extraction.subtotal_ht.user_corrected_value).replace(',', '.'))
                  : typeof extraction.subtotal_ht?.value === 'number' ? extraction.subtotal_ht.value
                  : extraction.subtotal_ht?.value != null ? parseFloat(String(extraction.subtotal_ht.value).replace(',', '.'))
                  : null
              }
              vatRate={
                extraction.tva_rate?.user_corrected_value != null
                  ? parseFloat(String(extraction.tva_rate.user_corrected_value).replace(',', '.'))
                  : typeof extraction.tva_rate?.value === 'number' ? extraction.tva_rate.value
                  : extraction.tva_rate?.value != null ? parseFloat(String(extraction.tva_rate.value).replace(',', '.'))
                  : null
              }
              vatAmount={
                extraction.tva_amount?.user_corrected_value != null
                  ? parseFloat(String(extraction.tva_amount.user_corrected_value).replace(',', '.'))
                  : typeof extraction.tva_amount?.value === 'number' ? extraction.tva_amount.value
                  : extraction.tva_amount?.value != null ? parseFloat(String(extraction.tva_amount.value).replace(',', '.'))
                  : null
              }
            />
          )}

          {/* Routing Completeness Alert — shown when routed partially */}
          {document.id && routedModules.length > 0 && (
            <RoutingCompletenessAlert
              documentId={document.id}
              onRoute={module => void handleRouteTo(module, module)}
            />
          )}

          {/* Duplicate warning */}
          {duplicateWarning && (
            <section>
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Ban size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Déjà envoyé vers {duplicateWarning.label}</p>
                  {duplicateWarning.routedAt && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      Envoyé le {new Date(duplicateWarning.routedAt).toLocaleDateString('fr-FR')}
                      {duplicateWarning.existingEntityId ? ` · ID: #${duplicateWarning.existingEntityId.slice(0, 8)}` : ''}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <a
                      href="/documents"
                      className="text-xs px-2 py-1 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100"
                    >
                      Voir l'enregistrement
                    </a>
                    <button
                      type="button"
                      onClick={() => setDuplicateWarning(null)}
                      className="text-xs px-2 py-1 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Routing suggestions — Actions recommandées */}
          {routingSuggestions.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions recommandées</h3>
                {routingSuggestions.filter(s => s.action !== 'view_only' && !routedModules.includes(s.module)).length > 1 && (
                  <button
                    type="button"
                    onClick={() => void handleRouteAll()}
                    disabled={routingAll || routing !== null}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 font-medium"
                  >
                    <Zap size={11} />
                    {routingAll ? 'Envoi en cours…' : 'Tout envoyer'}
                  </button>
                )}
              </div>

              {/* Confidence gate warning */}
              {classification && !isConfidentEnoughToRoute(classification.type_confidence) && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Confiance IA {Math.round(classification.type_confidence * 100)}% — sous le seuil de 90%.
                    Vérifiez le type détecté avant d'envoyer vers les modules financiers.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {routingSuggestions.map(suggestion => {
                  const alreadyRouted = routedModules.includes(suggestion.module);
                  const isViewOnly = suggestion.action === 'view_only';
                  const needsConfirmation = !isConfidentEnoughToRoute(classification?.type_confidence ?? 1) && STRICT_CONFIDENCE_MODULES.has(suggestion.module);
                  const isInProgress = routing === suggestion.module;

                  if (alreadyRouted) {
                    return (
                      <div
                        key={suggestion.module}
                        className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl"
                      >
                        <span className="text-lg shrink-0">{suggestion.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-green-800">{suggestion.label}</div>
                          <div className="text-xs text-green-600">{suggestion.description}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <CheckCheck size={14} className="text-green-500" />
                          <a href={suggestion.href} className="text-green-500 hover:text-green-600">
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={suggestion.module}
                      type="button"
                      onClick={() => {
                        if (!isViewOnly) void handleRouteTo(suggestion.module, suggestion.label);
                      }}
                      disabled={routing !== null || routingAll || isViewOnly}
                      title={isViewOnly ? 'Mis à jour automatiquement' : needsConfirmation ? 'Confiance faible — vérifiez avant envoi' : undefined}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors group ${
                        isViewOnly
                          ? 'bg-gray-50 border border-gray-100 opacity-60 cursor-default'
                          : needsConfirmation
                          ? 'bg-amber-50 border border-amber-200 hover:border-amber-400 disabled:opacity-50'
                          : 'bg-white border border-gray-200 hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50'
                      }`}
                    >
                      <span className="text-lg shrink-0">{suggestion.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isViewOnly ? 'text-gray-500' : needsConfirmation ? 'text-amber-800 group-hover:text-amber-900' : 'text-gray-900 group-hover:text-rose-700'}`}>
                          {suggestion.label}
                          {isViewOnly && <span className="ml-1.5 text-xs text-gray-400 font-normal">(automatique)</span>}
                          {needsConfirmation && <span className="ml-1.5 text-xs text-amber-600 font-normal">⚠ confiance faible</span>}
                        </div>
                        <div className="text-xs text-gray-400">{suggestion.description}</div>
                      </div>
                      {isInProgress ? (
                        <span className="text-xs text-rose-600 shrink-0">Envoi…</span>
                      ) : !isViewOnly ? (
                        <Send size={14} className={`shrink-0 ${needsConfirmation ? 'text-amber-400' : 'text-gray-300 group-hover:text-rose-500'}`} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          {validationStatus !== 'validated' && (
            <>
              {isBankStatement && classificationConfirmed && (
                <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                  Classification relevé bancaire confirmée — les champs facture (HT, TVA, N° facture) ne sont pas requis.
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleValidate('validated')}
                disabled={validating || !canValidateDocument}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
              >
                <CheckCircle size={16} />
                {validating ? 'Validation…' : isBankStatement ? 'Valider le relevé' : 'Valider le document'}
              </button>
            </>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleValidate('needs_correction')}
              disabled={validating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl hover:bg-amber-100 text-sm font-medium disabled:opacity-50"
            >
              <AlertTriangle size={14} />
              À corriger
            </button>
            <button
              type="button"
              onClick={() => void handleValidate('rejected')}
              disabled={validating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 bg-red-50 rounded-xl hover:bg-red-100 text-sm font-medium disabled:opacity-50"
            >
              <XCircle size={14} />
              Rejeter
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => document.id && onRetryOcr(document.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm"
            >
              <RotateCcw size={14} />
              Réessayer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm"
            >
              <Archive size={14} />
              Fermer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
