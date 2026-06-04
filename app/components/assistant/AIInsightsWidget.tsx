'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Brain, ChevronRight, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type { AtlasAiInsight, AtlasAiRecommendation } from '@/app/types/atlas-ai-copilot';

type InsightsPayload = {
  insights?: AtlasAiInsight[];
  recommendations?: AtlasAiRecommendation[];
  readiness_score?: number;
  anomaly_count?: number;
};

export function AIInsightsWidget() {
  const router = useRouter();
  const [insights, setInsights] = useState<AtlasAiInsight[]>([]);
  const [recommendations, setRecommendations] = useState<AtlasAiRecommendation[]>([]);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      const qs = cid ? `?companyId=${encodeURIComponent(cid)}` : '';
      const res = await fetch(`/api/assistant/insights${qs}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as InsightsPayload;
      setInsights(data.insights ?? []);
      setRecommendations(data.recommendations ?? []);
      setReadinessScore(data.readiness_score ?? null);
      setAnomalyCount(data.anomaly_count ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sevColor = (s: string) =>
    s === 'critical' ? 'text-red-700 bg-red-50 border-red-100'
      : s === 'warning' ? 'text-amber-700 bg-amber-50 border-amber-100'
        : 'text-blue-700 bg-blue-50 border-blue-100';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-600" />
          <h2 className="font-semibold text-gray-700 text-sm">AI Insights</h2>
          {anomalyCount > 0 && (
            <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
              {anomalyCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="text-gray-400 hover:text-violet-600" title="Actualiser">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => router.push('/liasse')} className="text-xs text-violet-600 hover:underline flex items-center gap-0.5">
            Liasse <ChevronRight size={12} />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2 min-h-[120px]">
        {loading ? (
          <Loader2 className="animate-spin text-gray-400 mx-auto" size={20} />
        ) : (
          <>
            {readinessScore != null && (
              <p className="text-[10px] text-gray-500 mb-1">
                Prêt pour clôture fiscale: <strong className={readinessScore >= 80 ? 'text-green-600' : 'text-amber-600'}>{readinessScore}%</strong>
              </p>
            )}
            {insights.slice(0, 3).map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => i.href && router.push(i.href)}
                className={`w-full text-left p-2.5 rounded-lg border text-xs ${sevColor(i.severity)}`}
              >
                <p className="font-semibold flex items-center gap-1">
                  {i.severity === 'critical' && <AlertTriangle size={12} />}
                  {i.title}
                </p>
                <p className="opacity-80 mt-0.5 line-clamp-2">{i.description}</p>
              </button>
            ))}
            {recommendations.slice(0, 2).map((r) => (
              <p key={r.id} className="text-xs text-gray-600 flex items-start gap-1.5">
                <Brain size={12} className="shrink-0 mt-0.5 text-violet-500" />
                <span>
                  {r.message}
                  {r.href && (
                    <button type="button" onClick={() => router.push(r.href!)} className="ml-1 text-violet-600 hover:underline">
                      Voir
                    </button>
                  )}
                </span>
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
