'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Shield } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

type ClosingPayload = {
  ready?: boolean;
  score?: number;
  blockingIssues?: string[];
  recommendations?: string[];
  labelFr?: string;
};

export function FiscalClosingAssistantWidget() {
  const [data, setData] = useState<ClosingPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      const qs = cid ? `?companyId=${encodeURIComponent(cid)}` : '';
      const res = await fetch(`/api/assistant/closing${qs}`, { credentials: 'include' });
      if (!res.ok) return;
      setData(await res.json() as ClosingPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAtlasSupabaseDataEnabled()) return;
    void load();
  }, [load]);

  if (!isAtlasSupabaseDataEnabled()) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Shield size={14} className="text-indigo-600" />
        <h2 className="font-semibold text-gray-700 text-sm">Clôture fiscale IA</h2>
      </div>
      <div className="p-4 min-h-[100px]">
        {loading ? (
          <Loader2 className="animate-spin text-gray-400 mx-auto" size={20} />
        ) : data ? (
          <>
            <p className={`text-sm font-semibold ${data.ready ? 'text-green-700' : 'text-red-700'}`}>
              {data.labelFr ?? (data.ready ? 'Prêt pour clôture fiscale' : 'Clôture non recommandée')}
            </p>
            <p className="text-xs text-gray-500 mt-1">Score: <strong>{data.score ?? '—'}%</strong></p>
            {(data.blockingIssues?.length ?? 0) > 0 && (
              <ul className="mt-2 space-y-1">
                {data.blockingIssues!.slice(0, 3).map((b, i) => (
                  <li key={i} className="text-xs text-amber-800 flex gap-1">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" /> {b}
                  </li>
                ))}
              </ul>
            )}
            {data.recommendations?.slice(0, 2).map((r, i) => (
              <p key={i} className="text-[10px] text-gray-500 mt-1">{r}</p>
            ))}
          </>
        ) : (
          <p className="text-xs text-gray-400">Évaluation indisponible</p>
        )}
      </div>
    </div>
  );
}
