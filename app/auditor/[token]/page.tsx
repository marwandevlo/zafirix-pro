'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Receipt, Scale, Shield } from 'lucide-react';

type AuditorData = {
  pass: { label: string; scope: string; expiresAt: string };
  summary: { invoiceCount: number; documentCount: number; contractCount: number };
  invoices: Array<{ id: string; number: string; client_name: string; total_ttc: number; status: string; due_date: string }>;
  documents: Array<{ id: string; filename: string; document_type: string; created_at: string }>;
  contracts: Array<{ id: string; title: string; expiry_date: string | null; document_type: string }>;
};

export default function AuditorGuestPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AuditorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/auditor/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          setError(err.error ?? 'Accès refusé');
          return;
        }
        setData(await res.json() as AuditorData);
      } catch {
        setError('Erreur réseau');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-[#1B2A4A]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center">
          <Shield size={40} className="mx-auto text-red-400 mb-4" />
          <h1 className="text-lg font-bold text-gray-800 mb-2">Accès auditeur indisponible</h1>
          <p className="text-sm text-gray-500">{error === 'expired' ? 'Ce pass invité a expiré.' : 'Lien invalide ou révoqué.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0F1F3D] text-white px-4 lg:px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-sm opacity-80 mb-1"><Shield size={16} /> Pass auditeur invité</div>
          <h1 className="text-xl lg:text-2xl font-bold">{data.pass.label}</h1>
          <p className="text-sm opacity-70 mt-1">Accès {data.pass.scope === 'audit_export' ? 'export audit' : 'lecture seule'} — expire le {new Date(data.pass.expiresAt).toLocaleDateString('fr-FR')}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3">
            <Receipt className="text-blue-500" size={24} />
            <div><p className="text-xs text-gray-400">Factures</p><p className="text-xl font-bold">{data.summary.invoiceCount}</p></div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3">
            <FileText className="text-rose-500" size={24} />
            <div><p className="text-xs text-gray-400">Documents</p><p className="text-xl font-bold">{data.summary.documentCount}</p></div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3">
            <Scale className="text-indigo-500" size={24} />
            <div><p className="text-xs text-gray-400">Contrats</p><p className="text-xl font-bold">{data.summary.contractCount}</p></div>
          </div>
        </div>

        <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Factures clients</h2>
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-xs text-gray-400 border-b bg-gray-50"><th className="px-4 py-2 text-left">N°</th><th className="px-4 py-2 text-left">Client</th><th className="px-4 py-2 text-right">TTC</th><th className="px-4 py-2">Statut</th></tr></thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium">{inv.number}</td>
                  <td className="px-4 py-2">{inv.client_name}</td>
                  <td className="px-4 py-2 text-right">{Number(inv.total_ttc).toLocaleString('fr-MA')} MAD</td>
                  <td className="px-4 py-2 text-xs">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Contrats juridiques</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b bg-gray-50"><th className="px-4 py-2 text-left">Titre</th><th className="px-4 py-2">Expiration</th></tr></thead>
            <tbody>
              {data.contracts.map((c) => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="px-4 py-2">{c.title ?? '—'}</td>
                  <td className="px-4 py-2 text-center text-xs">{c.expiry_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
