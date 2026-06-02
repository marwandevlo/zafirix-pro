'use client';

import { useState } from 'react';
import { X, Mail, Send, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

type SendEmailModalProps = {
  open: boolean;
  documentId: string;
  documentName: string;
  onClose: () => void;
};

type SendResult =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'skipped'; mailtoLink: string; message: string }
  | { status: 'error'; message: string };

export function SendEmailModal({ open, documentId, documentName, onClose }: SendEmailModalProps) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(`Document Zafirix Pro : ${documentName}`);
  const [message, setMessage] = useState('');
  const [includeShareLink, setIncludeShareLink] = useState(true);
  const [result, setResult] = useState<SendResult>({ status: 'idle' });

  const handleSend = async () => {
    if (!to.trim()) return;
    setResult({ status: 'sending' });

    try {
      // Optionally create a share link first
      let shareToken: string | undefined;
      if (includeShareLink) {
        const shareRes = await fetch(`/api/documents/${documentId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ permissions: 'read_only', expiresInHours: 72 }),
        });
        if (shareRes.ok) {
          const shareData = await shareRes.json() as { token?: string };
          shareToken = shareData.token;
        }
      }

      const res = await fetch(`/api/documents/${documentId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, subject, message, contentType: 'summary', shareToken }),
      });

      const data = await res.json() as {
        ok?: boolean;
        skipped?: boolean;
        mailtoLink?: string;
        message?: string;
        error?: string;
      };

      if (data.ok) {
        setResult({ status: 'sent' });
      } else if (data.skipped && data.mailtoLink) {
        setResult({ status: 'skipped', mailtoLink: data.mailtoLink, message: data.message ?? '' });
      } else {
        setResult({ status: 'error', message: data.message ?? data.error ?? 'Échec d\'envoi.' });
      }
    } catch {
      setResult({ status: 'error', message: 'Erreur réseau. Réessayez.' });
    }
  };

  const reset = () => {
    setResult({ status: 'idle' });
    setTo('');
    setMessage('');
    onClose();
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={reset} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <button onClick={reset} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Mail size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">Envoyer par email</h2>
            <p className="text-xs text-gray-400 truncate max-w-[300px]">{documentName}</p>
          </div>
        </div>

        {result.status === 'sent' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle size={40} className="text-green-500" />
            <p className="font-semibold text-gray-800">Email envoyé avec succès !</p>
            <p className="text-sm text-gray-500">Le destinataire recevra le document et un lien de consultation.</p>
            <button onClick={reset} className="mt-2 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
              Fermer
            </button>
          </div>
        )}

        {result.status === 'skipped' && (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Configuration email requise</p>
                <p className="text-xs text-amber-700 mt-1">
                  La clé <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY</code> n&apos;est pas configurée.
                  Vous pouvez envoyer manuellement via votre client email :
                </p>
              </div>
            </div>
            <a
              href={result.mailtoLink}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <ExternalLink size={14} />
              Ouvrir dans mon client email
            </a>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 text-center">
              Fermer
            </button>
          </div>
        )}

        {result.status === 'error' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{result.message}</p>
          </div>
        )}

        {(result.status === 'idle' || result.status === 'sending' || result.status === 'error') && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Destinataire *</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="exemple@entreprise.com"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Objet</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Message (optionnel)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="Ajoutez un message personnalisé…"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeShareLink}
                onChange={e => setIncludeShareLink(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-xs text-gray-600">Inclure un lien de consultation sécurisé (valide 72h)</span>
            </label>

            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => void handleSend()}
                disabled={!to.trim() || result.status === 'sending'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {result.status === 'sending' ? (
                  <><Loader2 size={14} className="animate-spin" /> Envoi…</>
                ) : (
                  <><Send size={14} /> Envoyer</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
