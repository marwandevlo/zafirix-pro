'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

type ReadinessResponse = {
  ok?: boolean;
  readinessScore?: number;
  label?: string;
  blockingIssues?: { length: number }[];
};

export function LiasseReadinessWidget() {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [blocking, setBlocking] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAtlasSupabaseDataEnabled()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const companyId = await getActiveCompanyDbRowId();
        const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
        const res = await fetch(`/api/liasse/readiness${qs}`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ReadinessResponse & { blockingIssues?: unknown[] };
        if (!cancelled) {
          setScore(data.readinessScore ?? 0);
          setBlocking(Array.isArray(data.blockingIssues) ? data.blockingIssues.length : 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const color =
    score == null ? 'text-gray-400'
      : score >= 80 ? 'text-green-600'
        : score >= 60 ? 'text-amber-600'
          : 'text-red-600';

  return (
    <button
      type="button"
      onClick={() => router.push('/liasse')}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-left w-full hover:border-blue-200 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck size={14} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-700 text-sm">Clôture fiscale (Liasse)</h3>
      </div>
      {loading ? (
        <Loader2 size={18} className="animate-spin text-gray-400" />
      ) : (
        <>
          <p className={`text-2xl font-bold ${color}`}>
            {score != null ? `${score}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Prêt pour clôture fiscale
            {blocking > 0 && (
              <span className="text-red-600 font-medium"> · {blocking} blocage(s)</span>
            )}
          </p>
        </>
      )}
    </button>
  );
}
