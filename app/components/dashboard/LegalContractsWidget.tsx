'use client';

/**
 * LegalContractsWidget
 *
 * Dashboard widget showing legal contracts with expiry status.
 * Highlights expiring (≤30d) and expired contracts.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle, Clock, ExternalLink, Loader2, Scale } from 'lucide-react';

type Contract = {
  id: string;
  title: string;
  document_type: string;
  expiry_date: string | null;
  days_until_expiry: number | null;
  status: 'active' | 'expiring' | 'expired';
  source_document_id: string | null;
};

type ContractSummary = {
  active: number;
  expiring: number;
  expired: number;
  total: number;
};

export function LegalContractsWidget() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/legal/contracts?status=all&limit=20', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { contracts: Contract[]; summary: ContractSummary };
        if (!cancelled) {
          // Show expiring/expired first
          const sorted = [...data.contracts].sort((a, b) => {
            const order = { expired: 0, expiring: 1, active: 2 };
            return order[a.status] - order[b.status];
          });
          setContracts(sorted.slice(0, 8));
          setSummary(data.summary);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statusBadge = (c: Contract) => {
    if (c.status === 'expired') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
          <AlertTriangle size={9} />
          Expiré
        </span>
      );
    }
    if (c.status === 'expiring') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
          <Clock size={9} />
          {c.days_until_expiry}j
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
        <CheckCircle size={9} />
        Actif
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-indigo-600" />
          <h2 className="font-semibold text-gray-700 text-sm">Contrats à surveiller</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push('/juridique')}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          Voir tout <ExternalLink size={10} />
        </button>
      </div>

      {/* KPI pills */}
      {summary && (
        <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="text-gray-600">{summary.active} actif{summary.active > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            <span className="text-gray-600">{summary.expiring} bientôt expiré{summary.expiring > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            <span className="text-gray-600">{summary.expired} expiré{summary.expired > 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          Aucun contrat enregistré.{' '}
          <button type="button" onClick={() => router.push('/juridique')} className="text-indigo-600 hover:underline">
            Ajouter via Documents IA
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {contracts.map(c => (
            <div
              key={c.id}
              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors ${c.status === 'expired' ? 'bg-red-50/30' : c.status === 'expiring' ? 'bg-orange-50/30' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{c.title}</p>
                {c.expiry_date && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Expiration: {new Date(c.expiry_date).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
              {statusBadge(c)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
