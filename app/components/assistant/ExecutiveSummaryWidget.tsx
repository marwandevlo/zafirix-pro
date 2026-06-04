'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, TrendingUp } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

type SummaryPayload = {
  period_label?: string;
  metrics?: {
    chiffre_affaires: number;
    charges: number;
    resultat: number;
    tresorerie: number;
    risk_count: number;
  };
  recommendations?: string[];
  narrative?: string;
};

export function ExecutiveSummaryWidget() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      const qs = cid ? `?companyId=${encodeURIComponent(cid)}&period=month` : '?period=month';
      const res = await fetch(`/api/assistant/executive-summary${qs}`, { credentials: 'include' });
      if (!res.ok) return;
      setData(await res.json() as SummaryPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAtlasSupabaseDataEnabled()) return;
    void load();
  }, [load]);

  if (!isAtlasSupabaseDataEnabled()) return null;

  const m = data?.metrics;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-emerald-600" />
          <h2 className="font-semibold text-gray-700 text-sm">Synthèse exécutive</h2>
        </div>
        <button type="button" onClick={() => void load()} className="text-[10px] text-violet-600 hover:underline">
          Actualiser
        </button>
      </div>
      <div className="p-4">
        {loading ? (
          <Loader2 className="animate-spin text-gray-400 mx-auto" size={20} />
        ) : m ? (
          <>
            <p className="text-[10px] text-gray-400 mb-2">{data?.period_label}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-emerald-50">
                <p className="text-gray-500">CA</p>
                <p className="font-bold text-emerald-800">{formatMadAmountLabel(m.chiffre_affaires)}</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-50">
                <p className="text-gray-500">Charges</p>
                <p className="font-bold text-amber-800">{formatMadAmountLabel(m.charges)}</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <p className="text-gray-500">Résultat</p>
                <p className={`font-bold ${m.resultat >= 0 ? 'text-blue-800' : 'text-red-700'}`}>
                  {formatMadAmountLabel(m.resultat)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-violet-50">
                <p className="text-gray-500">Trésorerie</p>
                <p className="font-bold text-violet-800">{formatMadAmountLabel(m.tresorerie)}</p>
              </div>
            </div>
            {m.risk_count > 0 && (
              <p className="text-[10px] text-red-600 mt-2 flex items-center gap-1">
                <TrendingUp size={11} /> {m.risk_count} risque(s) détecté(s)
              </p>
            )}
            {data?.recommendations?.[0] && (
              <p className="text-[10px] text-gray-600 mt-2 line-clamp-2">{data.recommendations[0]}</p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">Synthèse indisponible</p>
        )}
      </div>
    </div>
  );
}
