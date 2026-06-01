'use client';

import { useState, useCallback } from 'react';
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
} from 'lucide-react';
import type { AtlasDocument, AtlasExtractedField, AtlasStructuredExtraction } from '@/app/types/atlas-document';
import {
  classificationFromDocument,
  structuredExtractionFromDocument,
  validationStatusFromDocument,
} from '@/app/lib/atlas-documents-repository';
import {
  confidenceColor,
  confidenceLabel,
  documentTypeLabel,
  getRoutingSuggestions,
} from '@/app/lib/atlas-document-routing';

// ── Types ─────────────────────────────────────────────────────────────────────

type RoutingResult = {
  module: string;
  invoiceId?: string;
  journalLineCount?: number;
  tvaAmount?: number | null;
  tvaSuggestionId?: string | null;
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

export function ValidationCenter({ document, onClose, onValidated, onRetryOcr }: ValidationCenterProps) {
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [validating, setValidating] = useState(false);
  const [routing, setRouting] = useState<string | null>(null);
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showLineItems, setShowLineItems] = useState(false);

  const classification = classificationFromDocument(document);
  const extraction = structuredExtractionFromDocument(document);
  const validationStatus = validationStatusFromDocument(document);

  const routingSuggestions = classification?.detected_type
    ? getRoutingSuggestions(classification.detected_type)
    : [];

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
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
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { message?: string };
        showMessage('error', b.message ?? 'Erreur lors de la validation.');
        return;
      }
      showMessage('success', action === 'validated' ? 'Document validé.' : action === 'rejected' ? 'Document rejeté.' : 'Marqué à corriger.');
      onValidated();
    } catch {
      showMessage('error', 'Erreur réseau. Réessayez.');
    } finally {
      setValidating(false);
    }
  }, [document.id, onValidated]);

  const handleSaveCorrection = useCallback(async (fieldName: string, oldValue: string, newValue: string, reason: string, sourcePage?: number, confidenceBefore?: number) => {
    try {
      const res = await fetch(`/api/documents/${document.id}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fieldName, oldValue, newValue, correctionReason: reason, sourcePage, confidenceBefore }),
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

  const handleRouteTo = useCallback(async (module: string, label: string) => {
    setRouting(module);
    try {
      const res = await fetch(`/api/documents/${document.id}/route-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ module }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { message?: string };
        showMessage('error', b.message ?? `Échec de l'envoi vers ${label}.`);
        return;
      }
      const data = await res.json().catch(() => ({})) as RoutingResult & { ok?: boolean };
      setRoutingResult(data);
      const journalCount = data.journalLineCount ?? 0;
      const tvaAmt = data.tvaAmount;
      let successMsg = `Document envoyé vers ${label}.`;
      if (journalCount > 0) successMsg += ` ${journalCount} écritures créées.`;
      if (tvaAmt != null && tvaAmt > 0) successMsg += ` TVA: ${tvaAmt.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD.`;
      showMessage('success', successMsg);
      onValidated();
    } catch {
      showMessage('error', 'Erreur réseau. Réessayez.');
    } finally {
      setRouting(null);
    }
  }, [document.id, onValidated]);

  const visibleFields = extraction
    ? Object.entries(extraction).filter(([key, field]) => {
        if (key === 'line_items') return false;
        if (!field || typeof field !== 'object') return false;
        const f = field as AtlasExtractedField;
        return f.value != null || (f.user_corrected_value != null);
      })
    : [];

  const lineItems = Array.isArray(extraction?.line_items) ? extraction!.line_items : [];

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

          {/* Extracted fields */}
          {visibleFields.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Champs extraits</h3>
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
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Résultat de l'envoi</h3>
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

          {/* Routing suggestions */}
          {routingSuggestions.length > 0 && !routingResult && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions recommandées</h3>
              <div className="space-y-2">
                {routingSuggestions.map(suggestion => (
                  <button
                    key={suggestion.module}
                    type="button"
                    onClick={() => void handleRouteTo(suggestion.module, suggestion.label)}
                    disabled={routing !== null}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:border-rose-300 hover:bg-rose-50 transition-colors disabled:opacity-50 group"
                  >
                    <span className="text-lg shrink-0">{suggestion.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 group-hover:text-rose-700">{suggestion.label}</div>
                      <div className="text-xs text-gray-400">{suggestion.description}</div>
                    </div>
                    {routing === suggestion.module ? (
                      <span className="text-xs text-rose-600">Envoi…</span>
                    ) : (
                      <Send size={14} className="text-gray-300 group-hover:text-rose-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Re-route option after first routing */}
          {routingResult && routingSuggestions.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setRoutingResult(null)}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Envoyer vers un autre module
              </button>
            </section>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          {validationStatus !== 'validated' && (
            <button
              type="button"
              onClick={() => void handleValidate('validated')}
              disabled={validating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
            >
              <CheckCircle size={16} />
              {validating ? 'Validation…' : 'Valider le document'}
            </button>
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
