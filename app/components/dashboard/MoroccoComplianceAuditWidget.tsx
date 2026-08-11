'use client';

import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Scale,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type { MoroccoComplianceAuditResult, MoroccoComplianceFinding } from '@/app/types/zafirix-compliance-audit';

type Props = {
  lang?: 'fr' | 'ar';
};

function severityIcon(severity: MoroccoComplianceFinding['severity']) {
  if (severity === 'critical') return <ShieldAlert size={14} className="text-rose-600 shrink-0" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-600 shrink-0" />;
  return <Info size={14} className="text-slate-500 shrink-0" />;
}

function bandStyles(band: MoroccoComplianceAuditResult['band']) {
  if (band === 'healthy') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (band === 'attention') return 'bg-amber-50 text-amber-900 border-amber-200';
  return 'bg-rose-50 text-rose-900 border-rose-200';
}

export function MoroccoComplianceAuditWidget({ lang = 'fr' }: Props) {
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<MoroccoComplianceAuditResult | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId = (await getActiveCompanyDbRowId())?.trim();
      if (!companyId) {
        setError(t('Sélectionnez une société active.', 'اختروا شركة نشطة.'));
        return;
      }
      const res = await fetch('/api/audit/compliance', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? t('Échec de l’audit.', 'فشل التدقيق.'));
        return;
      }
      if (!json.audit) {
        setError(json.warning ?? t('Module en cours de déploiement.', 'الوحدة قيد النشر.'));
        return;
      }
      setAudit(json.audit as MoroccoComplianceAuditResult);
    } catch {
      setError(t('Erreur réseau. Réessayez.', 'خطأ في الشبكة. أعيدوا المحاولة.'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  return (
    <section className="dash-glass rounded-2xl overflow-hidden" data-tour="morocco-compliance-audit">
      <div className="px-4 sm:px-5 py-4 border-b border-slate-100/80 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#0F1F3D] text-cyan-300 flex items-center justify-center shrink-0">
            <Scale size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-[#0F1F3D]">
              {t('Audit & Conformité Maroc', 'التدقيق والامتثال — المغرب')}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t(
                'Expert-comptable virtuel — TVA, ICE, CNSS, plafonds AE, partie double',
                'محاسب افتراضي — TVA وICE وCNSS وأسقف المقاول الذاتي والقيد المزدوج',
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runAudit()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-[#0F1F3D] text-white text-sm font-semibold hover:bg-[#1B2A4A] disabled:opacity-60 shrink-0"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-cyan-300" />}
          {loading
            ? t('Analyse…', 'جاري التحليل…')
            : t('Lancer l’audit fiscal', 'تشغيل التدقيق الضريبي')}
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {error ? (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">{error}</p>
        ) : null}

        {!audit && !error && !loading ? (
          <p className="text-sm text-slate-500">
            {t(
              'Lancez un scan sur la société active pour détecter ICE manquants, taux TVA hors barème, montants incohérents et plafonds auto-entrepreneur.',
              'شغّلوا فحصاً على الشركة النشطة لاكتشاف ICE ناقص ونسب TVA غير مطابقة ومبالغ غير متسقة وأسقف المقاول الذاتي.',
            )}
          </p>
        ) : null}

        {audit ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${bandStyles(audit.band)}`}
              >
                {audit.band === 'healthy' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {t('Score', 'النقطة')} {audit.score}/100
              </span>
              <span className="text-[11px] text-slate-500">
                {audit.counts.invoicesScanned} {t('factures', 'فواتير')} ·{' '}
                {audit.counts.supplierInvoicesScanned} {t('achats', 'مشتريات')} ·{' '}
                {audit.counts.accountingEntriesScanned} {t('écritures', 'قيود')}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {lang === 'ar' ? audit.summaryAr : audit.summaryFr}
            </p>

            {audit.findings.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={16} />
                {t('Aucune anomalie critique sur l’échantillon.', 'لا توجد مخالفات حرجة في العينة.')}
              </div>
            ) : (
              <ul className="space-y-2.5 max-h-[28rem] overflow-y-auto overscroll-contain">
                {audit.findings.slice(0, 40).map((f) => (
                  <li
                    key={f.id}
                    className="rounded-xl border border-slate-100 bg-white/80 p-3 sm:p-3.5"
                  >
                    <div className="flex items-start gap-2">
                      {severityIcon(f.severity)}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0F1F3D]">
                          {lang === 'ar' ? f.titleAr : f.titleFr}
                          {f.entityLabel ? (
                            <span className="ml-1.5 text-xs font-medium text-slate-400">· {f.entityLabel}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {lang === 'ar' ? f.messageAr : f.messageFr}
                        </p>
                        <p className="text-xs text-cyan-800 mt-1.5 leading-relaxed">
                          → {lang === 'ar' ? f.recommendationAr : f.recommendationFr}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
