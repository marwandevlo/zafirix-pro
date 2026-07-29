'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type { FiscalComplianceScanResult } from '@/app/types/atlas-fiscal-compliance';

type Props = {
  fiscalYear?: number;
  lang?: 'fr' | 'ar';
  compact?: boolean;
};

export function FiscalCompliancePanel({ fiscalYear = new Date().getFullYear(), lang = 'fr', compact = false }: Props) {
  const router = useRouter();
  const t = (fr: string, ar: string) => (lang === 'fr' ? fr : ar);
  const [scan, setScan] = useState<FiscalComplianceScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cid = await getActiveCompanyDbRowId();
      if (!cid) {
        setScan(null);
        return;
      }
      const params = new URLSearchParams({ companyId: cid, fiscalYear: String(fiscalYear) });
      const res = await fetch(`/api/compliance/scan?${params}`, { credentials: 'include' });
      const data = (await res.json()) as { scan?: FiscalComplianceScanResult; error?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Scan impossible');
      setScan(data.scan ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [fiscalYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const bandIcon =
    scan?.band === 'healthy' ? ShieldCheck : scan?.band === 'attention' ? Shield : ShieldAlert;
  const BandIcon = bandIcon;
  const bandColor =
    scan?.band === 'healthy' ? 'text-green-600' : scan?.band === 'attention' ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-violet-600" />
          <h2 className="font-semibold text-sm text-gray-800">
            {t('Pré-contrôle fiscal DGI', 'فحص امتثال DGI')}
          </h2>
        </div>
        <button type="button" onClick={() => void load()} className="text-xs border rounded-lg px-2 py-1">
          {t('Actualiser', 'تحديث')}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-8 text-gray-400">
          <Loader2 className="animate-spin" size={20} />
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-red-700 px-4 py-3">{error}</p>
      )}

      {scan && !loading && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-bold ${bandColor}`}>{scan.score}%</div>
            <div>
              <div className="flex items-center gap-1.5">
                <BandIcon size={16} className={bandColor} />
                <p className="text-sm font-medium text-gray-800">
                  {t('Score conformité', 'نسبة الامتثال')}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                {t(`Risque audit ${scan.riskScore}%`, `مخاطر تدقيق ${scan.riskScore}%`)} · {scan.formulaVersion}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {(compact ? scan.findings.slice(0, 3) : scan.findings).map((f) => (
              <div
                key={f.id}
                className={`text-xs p-3 rounded-lg border ${
                  f.severity === 'critical'
                    ? 'bg-red-50 border-red-100'
                    : f.severity === 'warning'
                      ? 'bg-amber-50 border-amber-100'
                      : 'bg-gray-50 border-gray-100'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">{t(f.titleFr, f.titleAr)}</p>
                    <p className="text-gray-600 mt-0.5">{t(f.descriptionFr, f.descriptionAr)}</p>
                    <p className="text-gray-500 mt-1 italic">{t(f.recommendationFr, f.recommendationAr)}</p>
                    {f.href && (
                      <button
                        type="button"
                        onClick={() => router.push(f.href!)}
                        className="text-[#1B2A4A] font-medium mt-1 hover:underline"
                      >
                        {t('Corriger →', 'إصلاح →')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!scan.findings.length && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                {t('Aucune anomalie détectée sur les indicateurs analysés.', 'لم يتم رصد شذوذ على المؤشرات المحللة.')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
