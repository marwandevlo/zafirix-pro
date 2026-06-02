'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle, HelpCircle, Loader2, XCircle } from 'lucide-react';

type Summary = { matched: number; suggested: number; unmatched: number; rejected: number; total: number };

export function ReconciliationWidget() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/bank/reconciliation', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { summary: Summary };
        if (!cancelled) setSummary(data.summary);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 text-sm">Rapprochement bancaire</h2>
        <button
          type="button"
          onClick={() => router.push('/banque')}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          Ouvrir <ArrowRight size={10} />
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="p-4 grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
            <CheckCircle size={16} className="text-green-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-green-700">{summary?.matched ?? 0}</p>
            <p className="text-[10px] text-green-600 font-medium">Rapprochés</p>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-100">
            <HelpCircle size={16} className="text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-700">{summary?.suggested ?? 0}</p>
            <p className="text-[10px] text-amber-600 font-medium">Suggérés</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
            <XCircle size={16} className="text-red-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-red-700">{summary?.unmatched ?? 0}</p>
            <p className="text-[10px] text-red-600 font-medium">Non rapprochés</p>
          </div>
        </div>
      )}
    </div>
  );
}
