'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck, Loader2, ArrowRight } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

type ReadinessData = {
  readiness_score: number;
  liasse_generated: boolean;
  status: string;
};

export function LiasseReadinessWidget() {
  const router = useRouter();
  const [data, setData] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const fiscalYear = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAtlasSupabaseDataEnabled()) {
        setLoading(false);
        return;
      }
      const companyId = await getActiveCompanyDbRowId();
      if (!companyId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/liasse/readiness?companyId=${encodeURIComponent(companyId)}&fiscalYear=${fiscalYear}`,
          { credentials: 'include' },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json() as ReadinessData;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fiscalYear]);

  const score = data?.readiness_score ?? 0;
  const color = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';
  const ring = score >= 80 ? 'stroke-green-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-red-500';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck size={14} className="text-violet-600" />
          <h2 className="font-semibold text-gray-700 text-sm">Liasse fiscale — Clôture</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push('/liasse')}
          className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
        >
          Ouvrir
          <ArrowRight size={11} />
        </button>
      </div>
      <div className="p-4 flex items-center gap-4">
        {loading ? (
          <Loader2 size={20} className="animate-spin text-gray-400" />
        ) : (
          <>
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-gray-100" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className={ring}
                  strokeWidth="3"
                  strokeDasharray={`${score} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color}`}>
                {score}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">Exercice {fiscalYear}</p>
              <p className={`text-sm font-semibold mt-0.5 ${color}`}>
                Prêt pour clôture fiscale : {score}%
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {data?.liasse_generated
                  ? `Statut : ${data.status}`
                  : 'Liasse non générée — générez depuis le module'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
