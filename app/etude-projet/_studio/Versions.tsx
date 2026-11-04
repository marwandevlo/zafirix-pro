'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeStudy } from '@/app/lib/business-studio/engine';
import { computeMetrics, type StudyMetrics } from '@/app/lib/business-studio/metrics';
import type { StudyModel } from '@/app/lib/business-studio/model';
import type { AuditEvent, StudyRecord, VersionSummary } from '@/app/lib/business-studio/server-store';
import { ApiError, studioApi } from './client';
import { Badge, bi, Button, Card, Notice, TextField, useFormat, useStudio } from './ui';

const ACTION_LABEL: Record<string, { fr: string; ar: string }> = {
  created: { fr: 'Création', ar: 'إنشاء' }, imported: { fr: 'Import de l’ancienne étude', ar: 'استيراد الدراسة القديمة' },
  saved: { fr: 'Enregistrement', ar: 'حفظ' }, renamed: { fr: 'Renommage', ar: 'إعادة التسمية' },
  submit: { fr: 'Soumise pour revue', ar: 'أرسلت للمراجعة' }, approve: { fr: 'Approuvée', ar: 'تمت الموافقة' },
  reopen: { fr: 'Réouverte', ar: 'أعيد فتحها' }, archive: { fr: 'Archivée', ar: 'أرشفت' }, restore: { fr: 'Désarchivée', ar: 'استرجعت من الأرشيف' },
  version_created: { fr: 'Version créée', ar: 'إنشاء نسخة' }, version_restored: { fr: 'Version restaurée', ar: 'استرجاع نسخة' },
};

const SECTION_LABEL: Record<string, { fr: string; ar: string }> = {
  profile: { fr: 'Profil', ar: 'الملف' }, horizon: { fr: 'Horizon', ar: 'الأفق' }, general: { fr: 'Hypothèses générales', ar: 'الفرضيات العامة' },
  products: { fr: 'Produits', ar: 'المنتجات' }, expenses: { fr: 'Charges', ar: 'التكاليف' }, staff: { fr: 'Personnel', ar: 'المستخدمون' },
  investments: { fr: 'Investissements', ar: 'الاستثمارات' }, financing: { fr: 'Financement', ar: 'التمويل' }, workingCapital: { fr: 'BFR', ar: 'الحاجة إلى رأس المال العامل' },
  tax: { fr: 'Fiscalité', ar: 'الجبايات' }, opening: { fr: 'Bilan d’ouverture', ar: 'الميزانية الافتتاحية' }, scenarios: { fr: 'Scénarios', ar: 'السيناريوهات' },
  activeScenarioId: { fr: 'Scénario actif', ar: 'السيناريو النشط' }, risks: { fr: 'Risques', ar: 'المخاطر' }, swot: { fr: 'SWOT', ar: 'SWOT' }, pestel: { fr: 'PESTEL', ar: 'PESTEL' },
  narrative: { fr: 'Textes', ar: 'النصوص' }, sector: { fr: 'Secteur', ar: 'القطاع' }, sectorInputs: { fr: 'Données sectorielles', ar: 'المعطيات القطاعية' }, projectType: { fr: 'Type de projet', ar: 'نوع المشروع' },
};

export function Versions({ study, model, x, unsaved, locked, onRestored }: {
  study: StudyRecord; model: StudyModel; x: StudyMetrics; unsaved: boolean; locked: boolean; onRestored: (s: StudyRecord) => void;
}) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const when = (iso: string | number) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-MA' : 'fr-MA');
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState<{ summary: VersionSummary; model: StudyModel; metrics: StudyMetrics | null } | null>(null);

  const refresh = useCallback(async () => {
    try { setVersions(await studioApi.versions(study.id)); } catch (e) { setError(e instanceof ApiError ? e.code : 'network_error'); }
  }, [study.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.code : 'network_error'); } finally { setBusy(false); }
  };

  const create = () => act(async () => {
    await studioApi.createVersion(study.id, label.trim() || `${t(bi('Version', 'نسخة'))} ${when(Date.now())}`);
    setLabel('');
    await refresh();
  });
  const open = (v: VersionSummary) => act(async () => {
    const res = await studioApi.getVersion(study.id, v.id);
    let metrics: StudyMetrics | null = null;
    try { metrics = computeMetrics(res.model, computeStudy(res.model)); } catch { metrics = null; }
    setCompare({ summary: res.summary, model: res.model, metrics });
  });
  const restore = (v: VersionSummary) => act(async () => {
    if (!window.confirm(t(bi('Restaurer cette version ? Les hypothèses actuelles seront remplacées (créez d’abord une version pour les conserver).', 'استرجاع هذه النسخة؟ ستُعوض الفرضيات الحالية (أنشئ نسخة أولاً للاحتفاظ بها).')))) return;
    onRestored(await studioApi.restoreVersion(study.id, v.id, study.meta.revision));
    setCompare(null);
  });

  const changedSections = useMemo(() => {
    if (!compare) return [];
    const a = compare.model as unknown as Record<string, unknown>;
    const b = model as unknown as Record<string, unknown>;
    return Object.keys({ ...a, ...b }).filter((k) => k !== 'schemaVersion' && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  }, [compare, model]);

  const audit: AuditEvent[] = [...study.meta.audit].reverse();

  return (
    <div className="space-y-4">
      {error && <Notice tone="critical">{error}</Notice>}
      <Card title={t(bi('Créer une version', 'إنشاء نسخة'))}>
        <div className="flex flex-wrap items-end gap-3">
          <TextField label={t(bi('Libellé', 'التسمية'))} value={label} maxLength={120} onChange={setLabel} placeholder={t(bi('ex. Version présentée à la banque', 'مثال: النسخة المقدمة للبنك'))} />
          <Button variant="primary" disabled={busy || unsaved} onClick={() => void create()}>{t(bi('Créer la version', 'إنشاء النسخة'))}</Button>
        </div>
        {unsaved && <p className="mt-1 text-[11px] text-amber-700">{t(bi('Attendez la fin de l’enregistrement automatique.', 'انتظر انتهاء الحفظ التلقائي.'))}</p>}
      </Card>

      <Card title={t(bi('Historique des versions', 'سجل النسخ'))}>
        {versions == null ? <p className="text-xs text-gray-500">{t('loading')}</p> : versions.length === 0 ? <p className="text-xs text-gray-500">{t('none')}</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-start py-1.5 pe-3">{t(bi('Libellé', 'التسمية'))}</th>
                <th className="text-start px-2">{t(bi('Créée le', 'أنشئت في'))}</th>
                <th className="text-end px-2">{t('revision')}</th>
                <th className="text-end px-2">{t('kpi_revenue')}</th>
                <th className="text-end px-2">{t('kpi_netIncome')}</th>
                <th className="text-start px-2">{t(bi('Moteur', 'المحرك'))}</th>
                <th className="text-end px-2" />
              </tr></thead>
              <tbody>{versions.map((v) => (
                <tr key={v.id} className="border-t border-gray-100">
                  <td className="py-1.5 pe-3 font-medium">{v.label}</td>
                  <td className="px-2 whitespace-nowrap" dir="ltr">{when(v.createdAt)}</td>
                  <td className="px-2 text-end">{v.revision}</td>
                  <td className="px-2 text-end tabular-nums">{f.mad(v.revenue)}</td>
                  <td className="px-2 text-end tabular-nums">{f.mad(v.netIncome)}</td>
                  <td className="px-2 text-[10px] text-gray-500" dir="ltr">{v.engineVersion} · {v.rulesVersion} {v.checksOk ? <Badge tone="green">OK</Badge> : <Badge tone="red">KO</Badge>}</td>
                  <td className="px-2 text-end whitespace-nowrap">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void open(v)}>{t('compare')}</Button>
                    <Button size="sm" variant="danger" disabled={busy || locked} onClick={() => void restore(v)}>{t('restore')}</Button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-500">{t(bi('Les montants d’une version sont ceux calculés lors de sa création, avec le moteur indiqué.', 'مبالغ النسخة هي المحسوبة عند إنشائها بالمحرك المذكور.'))}</p>
      </Card>

      {compare && (
        <Card title={`${t('compare')} — ${compare.summary.label}`} actions={<Button size="sm" variant="ghost" onClick={() => setCompare(null)}>{t(bi('Fermer', 'إغلاق'))}</Button>}>
          <p className="text-xs mb-2">
            <span className="text-gray-500">{t(bi('Sections modifiées depuis cette version :', 'الأقسام المعدلة منذ هذه النسخة:'))} </span>
            {changedSections.length ? changedSections.map((k) => t(SECTION_LABEL[k] ?? { fr: k, ar: k })).join(' · ') : t(bi('aucune', 'لا شيء'))}
          </p>
          {compare.metrics ? (
            <table className="min-w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-start py-1.5 pe-3">{t(bi('Indicateur', 'المؤشر'))}</th>
                <th className="text-end px-2">{compare.summary.label}</th>
                <th className="text-end px-2">{t(bi('Actuel', 'الحالي'))}</th>
                <th className="text-end px-2">{t(bi('Écart', 'الفرق'))}</th>
              </tr></thead>
              <tbody>{([
                [t('kpi_revenue'), compare.metrics.totals.revenue, x.totals.revenue],
                [t('kpi_ebitda'), compare.metrics.totals.ebitda, x.totals.ebitda],
                [t('kpi_netIncome'), compare.metrics.totals.netIncome, x.totals.netIncome],
                [t('kpi_cashEnd'), compare.metrics.cashEnd.value, x.cashEnd.value],
                [t('kpi_minCash'), compare.metrics.minCash.value, x.minCash.value],
                [t('kpi_npv'), compare.metrics.npv.value, x.npv.value],
                [t('kpi_capex'), compare.metrics.totals.capex, x.totals.capex],
              ] as Array<[string, number | null, number | null]>).map(([l, a, b]) => (
                <tr key={l} className="border-t border-gray-100">
                  <td className="py-1.5 pe-3">{l} ({t('mad')})</td>
                  <td className="px-2 text-end tabular-nums">{f.mad(a)}</td>
                  <td className="px-2 text-end tabular-nums">{f.mad(b)}</td>
                  <td className="px-2 text-end tabular-nums">{a != null && b != null ? f.mad(b - a) : t('notAvailable')}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Notice tone="warning">{t(bi('Cette version ne peut pas être recalculée avec le moteur actuel.', 'لا يمكن إعادة حساب هذه النسخة بالمحرك الحالي.'))}</Notice>}
          <p className="mt-1 text-[11px] text-gray-500">{t(bi('Version recalculée avec le moteur actuel pour une comparaison à règles identiques.', 'أعيد حساب النسخة بالمحرك الحالي لمقارنة بنفس القواعد.'))}</p>
        </Card>
      )}

      <Card title={t(bi('Journal d’audit de l’étude', 'سجل تتبع الدراسة'))}>
        <ul className="divide-y divide-gray-100 text-xs max-h-80 overflow-y-auto">
          {audit.map((e, i) => (
            <li key={`${e.at}-${i}`} className="py-1.5 flex flex-wrap gap-x-3">
              <span className="text-gray-500 tabular-nums" dir="ltr">{when(e.at)}</span>
              <span className="font-medium">{t(ACTION_LABEL[e.action] ?? { fr: e.action, ar: e.action })}</span>
              <span className="text-gray-500">{t('revision')} {e.revision}</span>
              {e.detail && <span className="text-gray-400" dir="ltr">{e.detail}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-gray-500">{t(bi('Le journal conserve les derniers événements ; l’identifiant utilisateur n’est pas affiché.', 'يحتفظ السجل بآخر الأحداث؛ لا يُعرض معرف المستخدم.'))}</p>
      </Card>
    </div>
  );
}
