'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  FileText,
  Landmark,
  Loader2,
  Lock,
  Receipt,
  Scale,
  Shield,
  Wallet,
} from 'lucide-react';
import type { AuditorPortalPayload, AuditorPermission } from '@/app/types/atlas-auditor-pass';
import { AUDITOR_ROLE_LABELS, AUDITOR_SCOPE_LABELS } from '@/app/types/atlas-auditor-pass';

type Tab = 'overview' | 'journal' | 'ledger' | 'invoices' | 'payments' | 'bank';

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function can(session: AuditorPortalPayload['session'], perm: AuditorPermission): boolean {
  return session.permissions.includes(perm);
}

export default function AuditorGuestPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<AuditorPortalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);

  const load = useCallback(async (t: string, view: Tab) => {
    setLoading(true);
    setError(null);
    const viewParam = view === 'overview' ? 'dashboard' : view;
    try {
      const res = await fetch(`/api/auditor/${encodeURIComponent(t)}?view=${viewParam}`);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setError(err.error ?? 'Accès refusé');
        setData(null);
        return;
      }
      const json = await res.json() as AuditorPortalPayload & { ok?: boolean };
      setData(json);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void load(token, tab);
  }, [token, tab, load]);

  const exportReport = async (format: 'json' | 'csv') => {
    if (!token) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/auditor/${encodeURIComponent(token)}/export?format=${format}`);
      if (!res.ok) {
        setError('export_forbidden');
        return;
      }
      if (format === 'csv') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verification-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const json = await res.json() as { report?: unknown };
        const blob = new Blob([JSON.stringify(json.report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verification-audit-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
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
          <p className="text-sm text-gray-500">
            {error === 'expired' ? 'Ce pass invité a expiré.' : error === 'forbidden' ? 'Action non autorisée.' : 'Lien invalide ou révoqué.'}
          </p>
        </div>
      </div>
    );
  }

  const s = data.session;
  const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: <Shield size={14} />, show: true },
    { id: 'journal', label: 'Journal', icon: <BookOpen size={14} />, show: can(s, 'view_journal') },
    { id: 'ledger', label: 'Grand-livre', icon: <FileText size={14} />, show: can(s, 'view_ledger') },
    { id: 'invoices', label: 'Factures', icon: <Receipt size={14} />, show: can(s, 'view_invoices') },
    { id: 'payments', label: 'Paiements', icon: <Wallet size={14} />, show: can(s, 'view_payments') },
    { id: 'bank', label: 'Banque', icon: <Landmark size={14} />, show: can(s, 'view_bank') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0F1F3D] text-white px-4 lg:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm opacity-80 mb-1">
                <Lock size={14} /> Portail auditeur sécurisé — lecture seule
              </div>
              <h1 className="text-xl lg:text-2xl font-bold">{s.label}</h1>
              <p className="text-sm opacity-70 mt-1">
                {s.companyName} · {AUDITOR_ROLE_LABELS[s.auditorRole]} · {AUDITOR_SCOPE_LABELS[s.scope]}
              </p>
              <p className="text-xs opacity-60 mt-1">
                Expire le {new Date(s.expiresAt).toLocaleDateString('fr-FR')}
                {s.auditorFirm && ` · ${s.auditorFirm}`}
              </p>
            </div>
            {can(s, 'export_verification') && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void exportReport('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                >
                  <Download size={14} /> Export CSV
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void exportReport('json')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Download size={14} /> Rapport vérification
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-4">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === t.id ? 'bg-[#1B2A4A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4 lg:p-8 pt-0 space-y-6">
        {loading && (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
        )}

        {tab === 'overview' && !loading && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <p className="text-xs text-gray-400">Factures</p>
                <p className="text-2xl font-bold">{data.summary.invoiceCount}</p>
              </div>
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <p className="text-xs text-gray-400">Écritures journal</p>
                <p className="text-2xl font-bold">{data.summary.journalLineCount}</p>
              </div>
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <p className="text-xs text-gray-400">Équilibre journal</p>
                <p className={`text-lg font-bold ${data.summary.journalBalanced ? 'text-green-600' : 'text-red-600'}`}>
                  {data.summary.journalBalanced ? 'OK' : 'Déséquilibre'}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <p className="text-xs text-gray-400">Contrats</p>
                <p className="text-2xl font-bold">{data.summary.contractCount}</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-900">
              <p className="font-semibold mb-1">Accès restreint</p>
              <p>Ce portail est en lecture seule. Aucune modification n&apos;est possible. Toutes les consultations sont journalisées.</p>
              <p className="mt-2 opacity-80">Permissions : {s.permissions.join(', ')}</p>
            </div>
          </>
        )}

        {tab === 'journal' && data.journal && (
          <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Journal comptable</h2>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Libellé</th>
                  <th className="px-4 py-2 text-left">Compte</th>
                  <th className="px-4 py-2 text-right">Débit</th>
                  <th className="px-4 py-2 text-right">Crédit</th>
                  <th className="px-4 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.journal.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucune écriture</td></tr>
                )}
                {data.journal.map((line) => (
                  <tr key={line.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-500">{line.date}</td>
                    <td className="px-4 py-2">{line.libelle}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.compte}</td>
                    <td className="px-4 py-2 text-right text-blue-600">{line.debit > 0 ? formatMad(line.debit) : '—'}</td>
                    <td className="px-4 py-2 text-right text-green-600">{line.credit > 0 ? formatMad(line.credit) : '—'}</td>
                    <td className="px-4 py-2 text-xs">{line.validationStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'ledger' && data.ledger && (
          <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Grand-livre (soldes par compte)</h2>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left">Compte</th>
                  <th className="px-4 py-2 text-right">Débit</th>
                  <th className="px-4 py-2 text-right">Crédit</th>
                  <th className="px-4 py-2 text-right">Solde</th>
                  <th className="px-4 py-2 text-right">Lignes</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((acc) => (
                  <tr key={acc.compte} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-mono">{acc.compte}</td>
                    <td className="px-4 py-2 text-right">{formatMad(acc.totalDebit)}</td>
                    <td className="px-4 py-2 text-right">{formatMad(acc.totalCredit)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${acc.balance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {formatMad(acc.balance)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400">{acc.lineCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'invoices' && data.invoices && (
          <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Factures clients</h2>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left">N°</th>
                  <th className="px-4 py-2 text-left">Client</th>
                  <th className="px-4 py-2 text-right">TTC</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium">{inv.number}</td>
                    <td className="px-4 py-2">{inv.clientName}</td>
                    <td className="px-4 py-2 text-right">{formatMad(inv.totalTtc)}</td>
                    <td className="px-4 py-2 text-xs">{inv.status}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{inv.dueDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'payments' && data.payments && (
          <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Paiements</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">Montant</th>
                  <th className="px-4 py-2">Méthode</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-500">{p.paidAt?.slice(0, 10) ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatMad(p.amount)}</td>
                    <td className="px-4 py-2 text-xs">{p.method ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'bank' && data.bankTransactions && (
          <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700">Mouvements bancaires</h2>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Libellé</th>
                  <th className="px-4 py-2 text-right">Débit</th>
                  <th className="px-4 py-2 text-right">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {data.bankTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-500">{t.transactionDate ?? '—'}</td>
                    <td className="px-4 py-2">{t.label}</td>
                    <td className="px-4 py-2 text-right">{t.debit > 0 ? formatMad(t.debit) : '—'}</td>
                    <td className="px-4 py-2 text-right">{t.credit > 0 ? formatMad(t.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {data.contracts && data.contracts.length > 0 && tab === 'overview' && (
          <section className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <h2 className="px-4 py-3 border-b font-semibold text-sm text-gray-700 flex items-center gap-2">
              <Scale size={14} /> Contrats juridiques
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left">Titre</th>
                  <th className="px-4 py-2">Expiration</th>
                </tr>
              </thead>
              <tbody>
                {data.contracts.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="px-4 py-2">{c.title}</td>
                    <td className="px-4 py-2 text-center text-xs">{c.expiryDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
