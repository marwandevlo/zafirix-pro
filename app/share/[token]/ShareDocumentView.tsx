'use client';

import { useEffect, useState } from 'react';
import { Shield, Clock, FileText, AlertTriangle, CheckCircle, Loader2, Download } from 'lucide-react';
import type { DocumentExportPayload } from '@/app/lib/atlas-document-export';

type ShareData = {
  ok: true;
  permissions: string;
  expiresAt: string | null;
  document: DocumentExportPayload;
};

type ShareError = {
  error: 'link_revoked' | 'link_expired' | 'link_not_found' | 'document_not_found' | string;
};

const ERROR_MESSAGES: Record<string, string> = {
  link_revoked: 'Ce lien de partage a été révoqué. Contactez l\'expéditeur.',
  link_expired: 'Ce lien de partage a expiré. Contactez l\'expéditeur.',
  link_not_found: 'Lien introuvable ou invalide.',
  document_not_found: 'Document introuvable.',
};

function FieldRow({ label, value, confidence, corrected }: { label: string; value: string; confidence?: string; corrected?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 gap-4">
      <span className="text-xs text-gray-500 shrink-0 w-36">{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        {corrected && (
          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Corrigé</span>
        )}
        <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
        {confidence && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            Number(confidence.replace('%', '')) >= 90 ? 'bg-green-100 text-green-700' :
            Number(confidence.replace('%', '')) >= 70 ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            {confidence}
          </span>
        )}
      </div>
    </div>
  );
}

export function ShareDocumentView({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => r.json())
      .then((json: ShareData | ShareError) => {
        if ('ok' in json && json.ok) {
          setData(json as ShareData);
          setState('ok');
        } else {
          const e = json as ShareError;
          setError(ERROR_MESSAGES[e.error] ?? 'Erreur inconnue.');
          setState('error');
        }
      })
      .catch(() => {
        setError('Erreur réseau. Réessayez.');
        setState('error');
      });
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Vérification du lien…</span>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Lien invalide</h1>
          <p className="text-sm text-gray-500">{error}</p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield size={12} />
            <span>Zafirix Pro — Partage sécurisé</span>
          </div>
        </div>
      </div>
    );
  }

  const doc = data!.document;
  const ext = doc.extraction as Record<string, { value?: unknown; confidence?: number; user_corrected_value?: string } | undefined>;

  function fv(key: string): string {
    const f = ext[key];
    if (!f) return '';
    return (f.user_corrected_value ?? f.value ?? '') as string;
  }
  function fc(key: string): string {
    const f = ext[key];
    if (!f?.confidence) return '';
    return `${Math.round(f.confidence * 100)}%`;
  }
  function isCorrected(key: string): boolean {
    return !!ext[key]?.user_corrected_value;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center">
            <FileText size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Zafirix Pro</p>
            <p className="text-[10px] text-gray-400">Document partagé — Lecture seule</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Shield size={12} className="text-green-500" />
          <span className="text-green-600 font-medium">Lien sécurisé</span>
          {data?.expiresAt && (
            <span className="text-gray-400 ml-2 flex items-center gap-1">
              <Clock size={10} />
              Expire {new Date(data.expiresAt).toLocaleDateString('fr-MA')}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Document info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-lg font-bold text-gray-800">{doc.meta.filename}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium capitalize">
                  {doc.meta.document_type.replace(/_/g, ' ')}
                </span>
                {doc.meta.validation_status === 'validated' && (
                  <span className="text-xs flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle size={10} /> Validé
                  </span>
                )}
              </div>
            </div>
            {doc.classification && (
              <div className="text-right shrink-0">
                <p className="text-[10px] text-gray-400">Confiance IA</p>
                {(() => {
                  const conf = (doc.classification as Record<string, unknown>).type_confidence as number ?? 0;
                  return (
                    <p className={`text-lg font-bold ${conf >= 0.9 ? 'text-green-600' : conf >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                      {Math.round(conf * 100)}%
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Supplier + Invoice */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fournisseur</h2>
            <FieldRow label="Nom" value={fv('supplier_name')} confidence={fc('supplier_name')} corrected={isCorrected('supplier_name')} />
            <FieldRow label="ICE" value={fv('supplier_ice')} confidence={fc('supplier_ice')} />
            <FieldRow label="IF" value={fv('supplier_if')} />
            <FieldRow label="RC" value={fv('supplier_rc')} />
            <FieldRow label="Adresse" value={fv('supplier_address')} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Facture</h2>
            <FieldRow label="N° Facture" value={fv('invoice_number')} confidence={fc('invoice_number')} corrected={isCorrected('invoice_number')} />
            <FieldRow label="Date" value={fv('invoice_date')} confidence={fc('invoice_date')} />
            <FieldRow label="Échéance" value={fv('due_date')} />
            <FieldRow label="Devise" value={fv('currency')} />
          </div>
        </div>

        {/* Amounts */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Montants</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'HT', key: 'subtotal_ht', color: 'text-gray-800' },
              { label: 'TVA', key: 'tva_amount', color: 'text-blue-600' },
              { label: 'TTC', key: 'total_ttc', color: 'text-green-700' },
            ].map(({ label, key, color }) => (
              <div key={key} className="text-center">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>
                  {fv(key) ? `${Number(fv(key)).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` : '—'}
                </p>
                {fc(key) && (
                  <p className="text-[10px] text-gray-400">{fc(key)}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Download if permitted */}
        {data?.permissions === 'download' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Exporter</h2>
            <div className="flex flex-wrap gap-2">
              {(['pdf', 'xlsx', 'docx', 'xml', 'csv', 'json'] as const).map((fmt) => (
                <a
                  key={fmt}
                  href={`/api/share/${token}/export?format=${fmt}`}
                  download
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Download size={12} />
                  {fmt.toUpperCase()}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="text-center py-4">
          <p className="text-[10px] text-gray-400">
            Document partagé via <span className="font-medium">Zafirix Pro</span> · Source ID: {doc.meta.source_document_id.slice(0, 8)}…
          </p>
        </div>
      </main>
    </div>
  );
}
