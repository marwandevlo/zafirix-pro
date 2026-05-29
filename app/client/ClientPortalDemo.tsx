'use client';

import { useState } from 'react';
import { Building2, FileText, Receipt, CheckCircle, AlertCircle, Download, Clock } from 'lucide-react';

/**
 * Mock client portal for **development / explicit staging only**.
 * Disabled in production unless `NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true` (see `app/client/page.tsx`).
 */
export default function ClientPortalDemo() {
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (code === '1234') {
      setAuthenticated(true);
      setError('');
    } else {
      setError('Code incorrect. Contactez votre comptable.');
    }
  };

  const factures = [
    { id: 'F-001', date: '2026-04-01', montant: 18000, statut: 'payée' },
    { id: 'F-002', date: '2026-04-05', montant: 10200, statut: 'en attente' },
    { id: 'F-003', date: '2026-03-20', montant: 6000, statut: 'en retard' },
  ];

  const declarations = [
    { type: 'TVA Avril 2026', montant: 2400, statut: 'en attente', echeance: '20 Mai 2026' },
    { type: 'CNSS Avril 2026', montant: 7590, statut: 'payée', echeance: '25 Avril 2026' },
    { type: 'IS Acompte 2', montant: 20000, statut: 'en attente', echeance: '31 Mai 2026' },
  ];

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0F1F3D] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-amber-400 rounded-xl flex items-center justify-center">
              <Building2 size={28} className="text-[#0F1F3D]" />
            </div>
            <div>
              <p className="text-white font-bold text-2xl">ZAFIRIX PRO</p>
              <p className="text-white/40 text-sm">Espace Client (démo)</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h1 className="text-xl font-bold text-gray-800 mb-1">Connexion Espace Client</h1>
            <p className="text-sm text-gray-400 mb-6">Entrez le code fourni par votre comptable</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Code d'accès</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  type="password"
                  placeholder="••••"
                  className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono"
                  maxLength={4}
                />
              </div>
              <button
                type="button"
                onClick={handleLogin}
                className="w-full py-3 bg-[#0F1F3D] text-white rounded-lg font-medium hover:bg-[#1a3060] transition-colors"
              >
                Acceder a mon espace
              </button>
            </div>
            <p className="text-xs text-amber-800 text-center mt-4 rounded-lg bg-amber-50 border border-amber-100 px-2 py-2">
              Démo technique uniquement — données fictives, ne pas utiliser en production.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0F1F3D] text-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-[#0F1F3D]" />
            </div>
            <div>
              <p className="font-bold">ZAFIRIX PRO — Espace Client (démo)</p>
              <p className="text-white/40 text-xs">Données d&apos;exemple · IF fictif</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAuthenticated(false)}
            className="text-white/50 hover:text-white text-sm transition-colors"
          >
            Deconnexion
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-400">Total facture</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">34 200 MAD</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-5 shadow-sm border border-amber-200">
            <p className="text-xs text-gray-400">En attente paiement</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">10 200 MAD</p>
          </div>
          <div className="bg-red-50 rounded-xl p-5 shadow-sm border border-red-200">
            <p className="text-xs text-gray-400">Declarations a payer</p>
            <p className="text-2xl font-bold text-red-600 mt-1">22 400 MAD</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <FileText size={16} className="text-amber-500" />
            <h2 className="font-semibold text-gray-700">Mes factures</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3">Numero</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3 text-right">Montant TTC</th>
                <th className="px-6 py-3">Statut</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-700">{f.id}</td>
                  <td className="px-6 py-3 text-gray-500">{f.date}</td>
                  <td className="px-6 py-3 text-right font-medium">{f.montant.toLocaleString()} MAD</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        f.statut === 'payée'
                          ? 'bg-green-100 text-green-700'
                          : f.statut === 'en attente'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {f.statut}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <button type="button" className="text-gray-300 hover:text-blue-500 transition-colors">
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Receipt size={16} className="text-blue-500" />
            <h2 className="font-semibold text-gray-700">Mes declarations fiscales</h2>
          </div>
          <div className="p-4 space-y-3">
            {declarations.map((d, i) => (
              <div
                key={i}
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  d.statut === 'payée' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    d.statut === 'payée' ? 'bg-green-500' : 'bg-amber-400'
                  }`}
                >
                  {d.statut === 'payée' ? (
                    <CheckCircle size={20} className="text-white" />
                  ) : (
                    <Clock size={20} className="text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{d.type}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Echeance: {d.echeance}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">{d.montant.toLocaleString()} MAD</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      d.statut === 'payée' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {d.statut}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">Données de démonstration — ZAFIRIX PRO</p>
      </div>
    </div>
  );
}
