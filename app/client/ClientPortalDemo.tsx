'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Camera, CheckCircle, Loader2, Upload, AlertCircle } from 'lucide-react';

type Session = {
  accessCode: string;
  companyName: string;
};

type Props = {
  /** Pre-filled from /portal/[companyCode] — auto-connects when valid. */
  initialAccessCode?: string;
};

/**
 * Mobile-friendly client portal — snap/upload invoices → accountant validation queue.
 */
export default function ClientPortalDemo({ initialAccessCode }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState(initialAccessCode ?? '');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const autoLoginAttempted = useRef(false);

  const connectWithCode = async (accessCode: string) => {
    const trimmed = accessCode.trim();
    if (!trimmed) return;
    setError('');
    try {
      const res = await fetch('/api/client-portal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: trimmed }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        session?: { companyName: string };
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.session) {
        throw new Error(data.message ?? data.error ?? 'Code invalide');
      }
      setSession({ accessCode: trimmed, companyName: data.session.companyName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible');
    }
  };

  useEffect(() => {
    if (!initialAccessCode?.trim() || autoLoginAttempted.current || session) return;
    autoLoginAttempted.current = true;
    void connectWithCode(initialAccessCode);
  }, [initialAccessCode, session]);

  const handleLogin = async () => {
    await connectWithCode(code);
  };

  const uploadFile = async (file: File) => {
    if (!session) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData();
      form.append('accessCode', session.accessCode);
      form.append('file', file);
      if (note.trim()) form.append('note', note.trim());

      const res = await fetch('/api/client-portal/ingest', { method: 'POST', body: form });
      const data = (await res.json()) as { ok?: boolean; message?: string; companyName?: string; error?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Envoi impossible');
      setSuccess(data.message ?? 'Document envoyé à votre comptable.');
      if (data.companyName) {
        setSession((s) => (s ? { ...s, companyName: data.companyName! } : s));
      }
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setUploading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0F1F3D] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-amber-400 rounded-xl flex items-center justify-center">
              <Building2 size={28} className="text-[#0F1F3D]" />
            </div>
            <div>
              <p className="text-white font-bold text-2xl">ZAFIRIX PRO</p>
              <p className="text-white/40 text-sm">Espace Client · فضاء الزبون</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h1 className="text-xl font-bold text-gray-800 mb-1">Connexion rapide</h1>
            <p className="text-sm text-gray-400 mb-6">Code fourni par votre cabinet comptable</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
              type="password"
              placeholder="••••"
              className="w-full px-4 py-3 text-center text-2xl tracking-widest border rounded-lg focus:outline-none focus:border-amber-400 font-mono mb-4"
              maxLength={16}
            />
            <button
              type="button"
              onClick={() => void handleLogin()}
              className="w-full py-3 bg-[#0F1F3D] text-white rounded-lg font-medium"
            >
              Accéder · دخول
            </button>
            {process.env.NODE_ENV === 'development' && (
              <p className="text-xs text-amber-800 text-center mt-4 rounded-lg bg-amber-50 border border-amber-100 px-2 py-2">
                Code démo : <strong>1234</strong> — lié automatiquement à votre société de test.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-[#0F1F3D] text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">{session.companyName}</p>
            <p className="text-white/40 text-xs">Envoi factures & reçus · إرسال الوثائق</p>
          </div>
          <button type="button" onClick={() => setSession(null)} className="text-xs text-white/50">
            Quitter
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex gap-2">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl flex gap-2">
            <CheckCircle size={16} className="shrink-0" />
            {success}
          </div>
        )}

        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Photographier ou importer</h2>
          <p className="text-xs text-gray-500">
            Vos documents arrivent directement dans la file de validation OCR de votre comptable (/validation).
          </p>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note optionnelle (ex. facture restaurant mars)"
            rows={2}
            className="w-full text-sm border rounded-xl px-3 py-2 resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-[#0F1F3D]/20 hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="animate-spin text-[#0F1F3D]" /> : <Camera size={28} className="text-[#0F1F3D]" />}
              <span className="text-xs font-medium text-gray-700">Appareil photo</span>
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-[#0F1F3D]/20 hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="animate-spin text-[#0F1F3D]" /> : <Upload size={28} className="text-[#0F1F3D]" />}
              <span className="text-xs font-medium text-gray-700">Fichier / PDF</span>
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
        </div>

        <p className="text-center text-xs text-gray-400">
          Interface simplifiée — aucun accès aux livres comptables · Zafirix Pro
        </p>
      </div>
    </div>
  );
}
