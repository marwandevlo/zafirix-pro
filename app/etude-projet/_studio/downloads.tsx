'use client';

import { useEffect, useRef, useState } from 'react';
import { alignActuals } from '@/app/lib/business-studio/actuals';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import type { Bi, Lang } from '@/app/lib/business-studio/i18n';
import type { StudyMetrics } from '@/app/lib/business-studio/metrics';
import type { StudyModel } from '@/app/lib/business-studio/model';
import { buildReport, isDraftStatus, reportFileName, type ReportType } from '@/app/lib/business-studio/report-model';
import { chartImagesFor } from './chart-png';
import { ApiError, loadReportFonts, studioApi } from './client';
import { bi, Button, Card, Notice, useStudio } from './ui';

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function asBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof Uint8Array) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return data;
}

export function saveDownload(data: ArrayBuffer | Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([asBuffer(data)], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function generateStudyFile(input: {
  type: ReportType; lang: Lang; format: 'pdf' | 'xlsx' | 'docx';
  studyId: string; studyName: string; model: StudyModel; r: StudyResult; x: StudyMetrics;
  revision: number; status: string; hasCompany: boolean; includeUnvalidated: boolean;
}): Promise<{ data: Uint8Array; name: string; mime: string }> {
  let actuals = null;
  if (input.type === 'actuals' && input.hasCompany) {
    const res = await studioApi.actuals(input.studyId, input.includeUnvalidated);
    actuals = alignActuals(res.actuals, input.r.calendar.labels);
  }
  const report = buildReport({
    type: input.type, lang: input.lang, model: input.model, result: input.r, metrics: input.x,
    studyName: input.studyName, revision: input.revision, status: input.status,
    generatedAt: new Date().toISOString(), actuals, actualsIncludeUnvalidated: input.includeUnvalidated,
  });
  const name = reportFileName(report, input.format);
  if (input.format === 'pdf') {
    const { renderReportPdf } = await import('@/app/lib/business-studio/report-pdf');
    const fonts = input.lang === 'ar' ? await loadReportFonts() : undefined;
    return { data: new Uint8Array(renderReportPdf(report, fonts)), name, mime: PDF };
  }
  if (input.format === 'xlsx') {
    const { renderReportXlsx } = await import('@/app/lib/business-studio/report-xlsx');
    return { data: new Uint8Array(await renderReportXlsx(report)), name, mime: XLSX };
  }
  const { renderReportDocx } = await import('@/app/lib/business-studio/report-docx');
  return { data: await renderReportDocx(report, chartImagesFor(report)), name, mime: DOCX };
}

function messageFor(error: unknown, lang: Lang): string {
  const say = (text: Bi) => text[lang];
  const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : 'error';
  if (code === 'missing_session' || code === 'auth_required' || code === 'invalid_token') {
    return say(bi('Votre session a expiré. Reconnectez-vous, puis réessayez le téléchargement.', 'انتهت الجلسة. أعد تسجيل الدخول ثم أعد التنزيل.'));
  }
  if (code === 'arabic_font_required') {
    return say(bi('La police arabe du rapport n’a pas pu être chargée.', 'تعذر تحميل خط التقرير العربي.'));
  }
  return say(bi('Le fichier n’a pas pu être généré. Réessayez dans un instant.', 'تعذر إنشاء الملف. أعد المحاولة بعد لحظة.'));
}

const btn = 'inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60';

export function StudyDownloads({ studyId, studyName, model, r, x, revision, status, hasCompany, unsaved }: {
  studyId: string; studyName: string; model: StudyModel; r: StudyResult; x: StudyMetrics; revision: number; status: string; hasCompany: boolean; unsaved: boolean;
}) {
  const { t, lang } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string; data: Uint8Array; title: string } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const draft = isDraftStatus(status) || status === 'draft';

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => { if (preview) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [preview]);

  const run = async (key: string, format: 'pdf' | 'xlsx' | 'docx', mode: 'download' | 'preview' = 'download') => {
    setBusy(key);
    setError('');
    try {
      const file = await generateStudyFile({
        type: 'full', lang, format: mode === 'preview' ? 'pdf' : format,
        studyId, studyName, model, r, x, revision, status, hasCompany, includeUnvalidated: false,
      });
      if (file.data.byteLength < 1000) throw new Error('empty_file');
      if (mode === 'preview') {
        const url = URL.createObjectURL(new Blob([asBuffer(file.data)], { type: PDF }));
        setPreview({ url, name: file.name, data: file.data, title: t(bi('Étude complète', 'الدراسة الكاملة')) });
      } else {
        saveDownload(file.data, file.name, file.mime);
      }
    } catch (e) {
      setError(messageFor(e, lang));
    } finally {
      setBusy(null);
    }
  };

  const label = (key: string, fr: string, ar: string) => (busy === key ? t(bi('Génération…', 'جارٍ الإنشاء…')) : t(bi(fr, ar)));

  return (
    <section id="rapports-telechargements" aria-labelledby="rapports-telechargements-title" className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="rapports-telechargements-title" className="text-sm font-semibold text-[#1B2A4A]">
          {t(bi('Rapports et téléchargements', 'التقارير والتنزيلات'))}
        </h2>
        {draft && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-950">{t(bi('BROUILLON', 'مسودة'))}</span>}
      </div>
      <p className="mt-1 text-xs text-gray-600">
        {t(bi(
          'L’étude complète, avec les chiffres affichés à l’écran. Un brouillon se télécharge tout de suite et porte la mention BROUILLON.',
          'الدراسة الكاملة بنفس الأرقام المعروضة. يمكن تنزيل المسودة فوراً وعليها عبارة مسودة.',
        ))}
      </p>
      {unsaved && <div className="mt-2"><Notice tone="warning">{t(bi('Modifications en cours d’enregistrement : le fichier reprend les valeurs affichées.', 'تعديلات قيد الحفظ: الملف يأخذ القيم المعروضة.'))}</Notice></div>}
      {!r.checks.ok && <div className="mt-2"><Notice tone="critical">{t('checksKo')}</Notice></div>}
      {error && <div className="mt-2" role="alert"><Notice tone="critical">{error}</Notice></div>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className={`${btn} bg-[#1B2A4A] text-white hover:bg-[#243660] sm:min-w-[16rem]`} disabled={busy != null} onClick={() => void run('primary', 'pdf')}>
          {label('primary', 'Générer et télécharger l’étude', 'إنشاء الدراسة وتنزيلها')}
        </button>
        <button type="button" className={`${btn} bg-white text-gray-800 border border-gray-300`} disabled={busy != null} onClick={() => void run('pdf', 'pdf')}>
          {label('pdf', 'Télécharger PDF', 'تنزيل PDF')}
        </button>
        <button type="button" className={`${btn} bg-white text-gray-800 border border-gray-300`} disabled={busy != null} onClick={() => void run('docx', 'docx')}>
          {label('docx', 'Télécharger Word (.docx)', 'تنزيل Word (.docx)')}
        </button>
        <button type="button" className={`${btn} bg-white text-gray-800 border border-gray-300`} disabled={busy != null} onClick={() => void run('xlsx', 'xlsx')}>
          {label('xlsx', 'Télécharger Excel (.xlsx)', 'تنزيل Excel (.xlsx)')}
        </button>
        <button type="button" className={`${btn} bg-white text-[#1B2A4A] border border-[#1B2A4A]`} disabled={busy != null} onClick={() => void run('preview', 'pdf', 'preview')}>
          {label('preview', 'Prévisualiser le rapport', 'معاينة التقرير')}
        </button>
      </div>
      {preview && (
        <div ref={previewRef} className="mt-3">
          <Card title={`${t('preview')} — ${preview.title}`}>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => saveDownload(preview.data, preview.name, PDF)}>{t(bi('Télécharger le PDF', 'تنزيل PDF'))}</Button>
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">{t(bi('Ouvrir dans un nouvel onglet', 'فتح في علامة تبويب جديدة'))}</a>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>{t(bi('Fermer l’aperçu', 'إغلاق المعاينة'))}</Button>
            </div>
            <p className="mb-2 text-[11px] text-gray-500 md:hidden">{t(bi('Sur mobile, certains navigateurs n’affichent pas les PDF intégrés : utilisez « Ouvrir dans un nouvel onglet » ou « Télécharger le PDF ».', 'على الهاتف، لا تعرض بعض المتصفحات ملفات PDF المدمجة: استعمل «فتح في علامة تبويب جديدة» أو «تنزيل PDF».'))}</p>
            <iframe src={preview.url} title={`${t('preview')} — ${preview.title}`} className="h-[70vh] w-full rounded-lg border border-gray-200 bg-white" />
          </Card>
        </div>
      )}
    </section>
  );
}
