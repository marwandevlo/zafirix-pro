'use client';

import { useEffect, useRef, useState } from 'react';
import { alignActuals } from '@/app/lib/business-studio/actuals';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import { STR, tr, type Lang } from '@/app/lib/business-studio/i18n';
import type { StudyMetrics } from '@/app/lib/business-studio/metrics';
import type { StudyModel } from '@/app/lib/business-studio/model';
import { buildReport, reportFileName, REPORT_TYPES, type ReportType } from '@/app/lib/business-studio/report-model';
import { ApiError, loadReportFonts, studioApi } from './client';
import { bi, Button, Card, Notice, Toggle, useStudio } from './ui';

const DESCRIPTION: Record<ReportType, { fr: string; ar: string }> = {
  full: { fr: 'Étude complète : projet, hypothèses, indicateurs, états financiers, fiscalité, scénarios, risques et méthode.', ar: 'الدراسة الكاملة: المشروع والفرضيات والمؤشرات والقوائم المالية والجبايات والسيناريوهات والمخاطر والمنهجية.' },
  bank: { fr: 'Dossier bancaire : financement, plan de trésorerie, échéanciers de dette et DSCR.', ar: 'ملف بنكي: التمويل ومخطط الخزينة وجداول الديون ونسبة تغطية خدمة الدين.' },
  investor: { fr: 'Présentation investisseur : rentabilité, TRI, VAN, indicateurs sectoriels.', ar: 'عرض للمستثمر: المردودية ومعدل العائد الداخلي والقيمة الحالية الصافية والمؤشرات القطاعية.' },
  financials: { fr: 'États financiers prévisionnels : CPC, bilan, flux, plan de financement.', ar: 'القوائم المالية التوقعية: حساب العائدات والتكاليف والميزانية والتدفقات ومخطط التمويل.' },
  tax: { fr: 'Synthèse fiscale et sociale : IS, TVA, calendrier, paie, référentiel des règles.', ar: 'ملخص جبائي واجتماعي: الضريبة على الشركات والضريبة على القيمة المضافة والجدولة والأجور ومرجع القواعد.' },
  scenarios: { fr: 'Scénarios, sensibilité et tests de résistance.', ar: 'السيناريوهات والحساسية واختبارات الصمود.' },
  actuals: { fr: 'Prévisionnel vs réalisé (lecture seule de la comptabilité).', ar: 'التوقعات مقابل الإنجازات (قراءة المحاسبة فقط).' },
};

const LABEL: Record<ReportType, keyof typeof STR> = {
  full: 'rep_full', bank: 'rep_bank', investor: 'rep_investor', financials: 'rep_financials', tax: 'rep_tax', scenarios: 'rep_scenarios', actuals: 'rep_actuals',
};

function download(data: ArrayBuffer, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function Reports({ studyId, studyName, model, r, x, revision, status, hasCompany, unsaved }: {
  studyId: string; studyName: string; model: StudyModel; r: StudyResult; x: StudyMetrics; revision: number; status: string; hasCompany: boolean; unsaved: boolean;
}) {
  const { t } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [includeUnvalidated, setIncludeUnvalidated] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; data: ArrayBuffer; title: string } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => { if (preview) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [preview]);

  const generate = async (type: ReportType, lang: Lang, format: 'pdf' | 'xlsx', mode: 'download' | 'preview' = 'download') => {
    const key = `${type}-${lang}-${format}${mode === 'preview' ? '-preview' : ''}`;
    setBusy(key);
    setError('');
    try {
      let actuals = null;
      if (type === 'actuals' && hasCompany) {
        const res = await studioApi.actuals(studyId, includeUnvalidated);
        actuals = alignActuals(res.actuals, r.calendar.labels);
      }
      const report = buildReport({
        type, lang, model, result: r, metrics: x, studyName, revision, status,
        generatedAt: new Date().toISOString(), actuals, actualsIncludeUnvalidated: includeUnvalidated,
      });
      if (format === 'pdf') {
        const { renderReportPdf } = await import('@/app/lib/business-studio/report-pdf');
        const fonts = lang === 'ar' ? await loadReportFonts() : undefined;
        const data = renderReportPdf(report, fonts);
        if (mode === 'preview') {
          const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
          setPreview({ url, name: reportFileName(report, 'pdf'), data, title: `${tr(LABEL[type], lang)} — ${lang === 'fr' ? 'Français' : 'العربية'}` });
        } else {
          download(data, reportFileName(report, 'pdf'), 'application/pdf');
        }
      } else {
        const { renderReportXlsx } = await import('@/app/lib/business-studio/report-xlsx');
        download(await renderReportXlsx(report), reportFileName(report, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.code : e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {unsaved && <Notice tone="warning">{t(bi('Modifications en cours d’enregistrement : le rapport reflète les valeurs affichées, la révision indiquée peut être antérieure.', 'تعديلات قيد الحفظ: يعكس التقرير القيم المعروضة، وقد تكون المراجعة المذكورة سابقة.'))}</Notice>}
      {!r.checks.ok && <Notice tone="critical">{t('checksKo')}</Notice>}
      <Notice>{t(bi('Chaque rapport comporte une page de garde, un sommaire, la pagination, la version du moteur et du référentiel fiscal, et l’avertissement « prévisionnel ». Les valeurs proviennent du même calcul que les écrans.', 'يتضمن كل تقرير صفحة غلاف وفهرساً وترقيماً للصفحات وإصدار المحرك والمرجع الجبائي وتنبيه «توقعي». القيم مستمدة من نفس الحساب المعروض في الشاشات.'))}</Notice>
      {error && <Notice tone="critical">{t(bi('Échec de la génération', 'فشل الإنشاء'))} ({error})</Notice>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORT_TYPES.map((type) => (
          <Card key={type} title={t(STR[LABEL[type]])}>
            <p className="text-xs text-gray-600 min-h-[3rem]">{t(DESCRIPTION[type])}</p>
            {type === 'actuals' && (
              hasCompany
                ? <div className="mt-2"><Toggle label={t(bi('Inclure les écritures non validées', 'تضمين القيود غير المصادق عليها'))} checked={includeUnvalidated} onChange={setIncludeUnvalidated} /></div>
                : <p className="mt-2 text-[11px] text-amber-700">{t(bi('Étude non liée à une entreprise : le rapport indiquera l’absence de données réelles.', 'دراسة غير مرتبطة بمقاولة: سيشير التقرير إلى غياب المعطيات الفعلية.'))}</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['fr', 'ar'] as const).map((lang) => (['pdf', 'xlsx'] as const).map((format) => {
                const key = `${type}-${lang}-${format}`;
                return (
                  <Button key={key} size="sm" variant={format === 'pdf' ? 'primary' : 'secondary'} disabled={busy != null} onClick={() => void generate(type, lang, format)}>
                    {busy === key ? tr('loading', lang) : `${format.toUpperCase()} · ${lang === 'fr' ? 'Français' : 'العربية'}`}
                  </Button>
                );
              }))}
              {(['fr', 'ar'] as const).map((lang) => {
                const key = `${type}-${lang}-pdf-preview`;
                return (
                  <Button key={key} size="sm" variant="ghost" disabled={busy != null} onClick={() => void generate(type, lang, 'pdf', 'preview')}>
                    {busy === key ? tr('loading', lang) : `${tr('preview', lang)} · ${lang === 'fr' ? 'Français' : 'العربية'}`}
                  </Button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      {preview && (
        <div ref={previewRef}>
          <Card title={`${t('preview')} — ${preview.title}`}>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => download(preview.data, preview.name, 'application/pdf')}>{t(bi('Télécharger le PDF', 'تحميل PDF'))}</Button>
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                {t(bi('Ouvrir dans un nouvel onglet', 'فتح في علامة تبويب جديدة'))}
              </a>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>{t(bi('Fermer l’aperçu', 'إغلاق المعاينة'))}</Button>
            </div>
            <p className="mb-2 text-[11px] text-gray-500 md:hidden">{t(bi('Sur mobile, certains navigateurs n’affichent pas les PDF intégrés : utilisez « Ouvrir dans un nouvel onglet » ou « Télécharger ».', 'على الهاتف، لا تعرض بعض المتصفحات ملفات PDF المدمجة: استعمل «فتح في علامة تبويب جديدة» أو «تحميل».'))}</p>
            <iframe src={preview.url} title={`${t('preview')} — ${preview.title}`} className="h-[75vh] w-full rounded-lg border border-gray-200 bg-gray-50" />
          </Card>
        </div>
      )}
    </div>
  );
}
