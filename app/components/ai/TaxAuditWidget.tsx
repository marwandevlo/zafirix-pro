'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ScanSearch,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type {
  MoroccoComplianceAuditResult,
  MoroccoComplianceFinding,
} from '@/app/types/zafirix-compliance-audit';

type Lang = 'fr' | 'ar';

type Props = {
  lang?: Lang;
  autoScan?: boolean;
};

function severityIcon(severity: MoroccoComplianceFinding['severity']) {
  if (severity === 'critical') return <ShieldAlert size={14} className="text-rose-600 shrink-0" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-600 shrink-0" />;
  return <Info size={14} className="text-slate-500 shrink-0" />;
}

function bandLabel(band: MoroccoComplianceAuditResult['band'], lang: Lang) {
  if (band === 'healthy') return lang === 'ar' ? 'مطابق' : 'Conforme';
  if (band === 'attention') return lang === 'ar' ? 'انتباه' : 'Attention';
  return lang === 'ar' ? 'حرج' : 'Critique';
}

function ScoreRing({ score, band }: { score: number; band: MoroccoComplianceAuditResult['band'] }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  const stroke = band === 'healthy' ? '#06b6d4' : band === 'attention' ? '#f59e0b' : '#e11d48';

  return (
    <div className="relative w-[92px] h-[92px] shrink-0">
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#0F1F3D" strokeWidth="8" opacity="0.12" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-[#0F1F3D] leading-none">{score}</span>
        <span className="text-[9px] font-semibold text-slate-400 mt-0.5">/100</span>
      </div>
    </div>
  );
}

export function TaxAuditWidget({ lang: initialLang = 'fr', autoScan = true }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<MoroccoComplianceAuditResult | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [payloadJson, setPayloadJson] = useState('');

  const t = useCallback((fr: string, ar: string) => (lang === 'ar' ? ar : fr), [lang]);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId = (await getActiveCompanyDbRowId())?.trim();
      let extra: Record<string, unknown> = {};
      if (payloadJson.trim()) {
        try {
          const parsed = JSON.parse(payloadJson) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setError(t('Le payload JSON doit être un objet.', 'يجب أن يكون JSON كائناً.'));
            return;
          }
          extra = parsed as Record<string, unknown>;
        } catch {
          setError(t('JSON invalide dans le payload.', 'JSON غير صالح في البيانات.'));
          return;
        }
      }

      if (!companyId && Object.keys(extra).length === 0) {
        setError(t('Sélectionnez une société active.', 'اختروا شركة نشطة.'));
        return;
      }

      const res = await fetch('/api/ai/tax-audit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...extra }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        audit?: MoroccoComplianceAuditResult | null;
        message?: string;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? t('Échec de l’audit.', 'فشل التدقيق.'));
        return;
      }
      if (!json.audit) {
        setError(json.warning ?? t('Module en cours de déploiement.', 'الوحدة قيد النشر.'));
        return;
      }
      setAudit(json.audit);
    } catch {
      setError(t('Erreur réseau. Réessayez.', 'خطأ في الشبكة. أعيدوا المحاولة.'));
    } finally {
      setLoading(false);
    }
  }, [payloadJson, t]);

  useEffect(() => {
    setLang(initialLang);
  }, [initialLang]);

  useEffect(() => {
    if (!autoScan) return;
    void runAudit();
    // First mount / language switch should not retrigger a scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-scan once on mount
  }, [autoScan]);

  const recommendations = useMemo(() => {
    if (!audit) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of audit.findings ?? []) {
      const rec = lang === 'ar' ? f.recommendationAr : f.recommendationFr;
      if (!rec || seen.has(rec)) continue;
      seen.add(rec);
      out.push(rec);
    }
    return out.slice(0, 8);
  }, [audit, lang]);

  return (
    <section
      className="dash-glass rounded-2xl overflow-hidden"
      data-tour="smart-tax-audit"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div
        className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
        style={{ background: '#0F1F3D' }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#06b6d4' }}
          >
            <ScanSearch size={18} className="text-[#0F1F3D]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-white">
              {t('Smart Tax Audit', 'التدقيق الضريبي الذكي')}
            </h2>
            <p className="text-[11px] text-cyan-200/80 mt-0.5">
              {t(
                'ICE · TVA 0/7/10/14/20 % · RAS · plafonds auto-entrepreneur',
                'ICE · TVA 0/7/10/14/20٪ · الاقتطاع · أسقف المقاول الذاتي',
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg overflow-hidden border border-white/15 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setLang('fr')}
              className={`px-2.5 py-1.5 ${lang === 'fr' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/80'}`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLang('ar')}
              className={`px-2.5 py-1.5 ${lang === 'ar' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/80'}`}
            >
              ع
            </button>
          </div>
          <button
            type="button"
            onClick={() => void runAudit()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 min-h-10 px-3.5 rounded-xl text-sm font-semibold disabled:opacity-60"
            style={{ background: '#06b6d4', color: '#0F1F3D' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? t('Analyse…', 'جاري التحليل…') : t('Scanner', 'فحص')}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {error ? (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">{error}</p>
        ) : null}

        {loading && !audit ? (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-[#06b6d4]" />
            {t('Scan des factures, écritures et plafonds fiscaux…', 'فحص الفواتير والقيود والأسقف الضريبية…')}
          </p>
        ) : null}

        {audit ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <ScoreRing score={audit.score} band={audit.band} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#06b6d4' }}>
                  {t('Score de conformité', 'نقطة الامتثال')} · {bandLabel(audit.band, lang)}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed mt-1">
                  {lang === 'ar' ? audit.summaryAr : audit.summaryFr}
                </p>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {audit.counts?.invoicesScanned ?? 0} {t('factures', 'فواتير')} ·{' '}
                  {audit.counts?.supplierInvoicesScanned ?? 0} {t('achats', 'مشتريات')} ·{' '}
                  {audit.counts?.accountingEntriesScanned ?? 0} {t('écritures', 'قيود')} ·{' '}
                  {audit.counts?.critical ?? 0} {t('critiques', 'حرجة')} · {audit.counts?.warning ?? 0}{' '}
                  {t('alertes', 'تنبيهات')}
                </p>
              </div>
            </div>

            {recommendations.length > 0 ? (
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-3.5">
                <p className="text-xs font-bold text-[#0F1F3D] mb-2">
                  {t('Recommandations', 'توصيات')}
                </p>
                <ul className="space-y-1.5">
                  {recommendations.map((rec) => (
                    <li key={rec} className="text-xs text-slate-700 leading-relaxed flex gap-1.5">
                      <span className="text-[#06b6d4] font-bold shrink-0">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={16} />
                {t('Aucune anomalie sur l’échantillon scanné.', 'لا توجد مخالفات في العينة المفحوصة.')}
              </div>
            )}

            {(audit.findings ?? []).length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#0F1F3D] mb-2">
                  {t('Risques détectés', 'المخاطر المكتشفة')}
                </p>
                <ul className="space-y-2.5 max-h-[28rem] overflow-y-auto overscroll-contain">
                  {(audit.findings ?? []).slice(0, 40).map((f) => (
                    <li key={f.id} className="rounded-xl border border-slate-100 bg-white/80 p-3 sm:p-3.5">
                      <div className="flex items-start gap-2">
                        {severityIcon(f.severity)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#0F1F3D]">
                            {lang === 'ar' ? f.titleAr : f.titleFr}
                            {f.entityLabel ? (
                              <span className="mx-1.5 text-xs font-medium text-slate-400">· {f.entityLabel}</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {lang === 'ar' ? f.messageAr : f.messageFr}
                          </p>
                          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#0e7490' }}>
                            {lang === 'ar' ? f.recommendationAr : f.recommendationFr}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        <div>
          <button
            type="button"
            onClick={() => setShowPayload((v) => !v)}
            className="text-[11px] font-semibold text-slate-500 hover:text-[#0F1F3D]"
          >
            {showPayload
              ? t('Masquer le payload manuel', 'إخفاء البيانات اليدوية')
              : t('Analyser un payload (factures / journal)', 'تحليل بيانات (فواتير / يومية)')}
          </button>
          {showPayload ? (
            <textarea
              value={payloadJson}
              onChange={(e) => setPayloadJson(e.target.value)}
              rows={6}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700"
              placeholder={`{
  "companyIce": "001234567000089",
  "invoices": [{ "number": "F-001", "ice": "001234567000089", "vatRate": 20, "amountHt": 1000, "vatAmount": 200, "totalTtc": 1200 }],
  "ledger": [{ "label": "Honoraires", "debit": 1000, "credit": 1000, "withholdingRate": 10 }],
  "aeTurnoverMad": 180000,
  "aeActivity": "services"
}`}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
