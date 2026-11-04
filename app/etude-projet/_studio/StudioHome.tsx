'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getActiveAtlasCompany, getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { PROJECT_TYPE_LABEL, SECTOR_LABEL } from '@/app/lib/business-studio/i18n';
import { MAX_YEARS, PROJECT_TYPES, SECTORS, type LegalForm, type ProjectType, type SectorId } from '@/app/lib/business-studio/model';
import { modelFromTemplate } from '@/app/lib/business-studio/sectors';
import type { StudySummary } from '@/app/lib/business-studio/server-store';
import type { AtlasCompany } from '@/app/types/atlas-company';
import { ApiError, studioApi } from './client';
import { Badge, bi, Button, Card, LangToggle, Notice, NumField, SelectField, TextField, Toggle, useStudio } from './ui';

const STATUS_TONE: Record<string, 'gray' | 'amber' | 'green' | 'blue' | 'red'> = { draft: 'gray', under_review: 'amber', approved: 'green', archived: 'blue', legacy: 'red' };

const LEGAL_FORM_MAP: Array<[RegExp, LegalForm]> = [
  [/^sarl\s*(au|a\.u\.?|associ[ée] unique)/i, 'sarl_au'], [/^sarl/i, 'sarl'], [/^sas\b/i, 'sas'], [/^sa\b/i, 'sa'], [/^snc/i, 'snc'], [/^scs/i, 'scs'],
  [/^gie/i, 'gie'], [/coop/i, 'cooperative'], [/auto.?entrepreneur/i, 'auto_entrepreneur'], [/personne physique|entreprise individuelle/i, 'personne_physique'],
];

function nextMonth(): string {
  const d = new Date();
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function StudioHome() {
  const { t, lang } = useStudio();
  const router = useRouter();
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [allCompanies, setAllCompanies] = useState(false);
  const [company, setCompany] = useState<{ id: string | null; data: AtlasCompany | null }>({ id: null, data: null });
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [form, setForm] = useState({ name: '', sector: 'services' as SectorId, projectType: 'creation' as ProjectType, startMonth: nextMonth(), years: 5, linkCompany: true, prefill: true });

  const refresh = useCallback(async () => {
    try { setStudies(await studioApi.list({ includeArchived })); } catch (e) { setError(e instanceof ApiError ? e.code : 'network_error'); }
  }, [includeArchived]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let alive = true;
    void Promise.all([getActiveCompanyDbRowId(), getActiveAtlasCompany()])
      .then(([id, data]) => { if (alive) setCompany({ id, data }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.code : 'network_error'); } finally { setBusy(false); }
  };

  const create = () => act(async () => {
    const model = modelFromTemplate(form.sector, { startMonth: form.startMonth, years: form.years, projectType: form.projectType });
    const c = company.data;
    if (form.linkCompany && form.prefill && c) {
      const legalForm = LEGAL_FORM_MAP.find(([re]) => re.test(c.formeJuridique ?? ''))?.[1] ?? '';
      model.profile.company = {
        ...model.profile.company,
        name: c.raisonSociale ?? '', tradingName: c.tradeName ?? '', legalForm, address: c.adresse ?? '', city: c.ville ?? '',
        phone: c.telephone ?? '', email: c.email ?? '', activity: c.activite ?? '', incorporated: true,
        ice: (c.ice ?? '').replace(/\D/g, '').slice(0, 15), rc: c.rc ?? '', if: c.if_fiscal ?? '', cnss: c.cnss ?? '',
      };
    }
    const s = await studioApi.create({ name: form.name.trim() || t(bi('Nouvelle étude', 'دراسة جديدة')), companyId: form.linkCompany ? company.id : null, model });
    router.push(`/etude-projet/${s.id}`);
  });

  const setStatus = (s: StudySummary, action: 'archive' | 'restore') => act(async () => {
    await studioApi.status(s.id, action, s.revision ?? 1);
    await refresh();
  });
  const duplicate = (s: StudySummary) => act(async () => {
    const d = await studioApi.duplicate(s.id, `${s.name} — ${t(bi('copie', 'نسخة'))}`);
    router.push(`/etude-projet/${d.id}`);
  });
  const importLegacy = (s: StudySummary) => act(async () => {
    const res = await studioApi.importLegacy(s.id);
    setNotes(res.notes);
    await refresh();
    router.push(`/etude-projet/${res.study.id}`);
  });

  const visible = (studies ?? []).filter((s) => allCompanies || !company.id || s.companyId == null || s.companyId === company.id);
  const v2 = visible.filter((s) => s.kind === 'v2');
  const legacy = visible.filter((s) => s.kind === 'legacy');
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA');

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold text-gray-800">{t('appTitle')}</h1>
          <p className="text-xs text-gray-500">{t(bi('Études prévisionnelles : hypothèses, états financiers, fiscalité marocaine, scénarios et rapports.', 'دراسات توقعية: الفرضيات والقوائم المالية والجبايات المغربية والسيناريوهات والتقارير.'))}</p>
        </div>
        <LangToggle />
        <Link href="/etude-projet/assistant" className="text-xs text-gray-600 underline">{t('openAssistant')}</Link>
        <Button variant="primary" onClick={() => setWizard((w) => !w)}>{t('newStudy')}</Button>
      </header>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {error && <Notice tone="critical">{error}</Notice>}
        {notes.length > 0 && <Notice tone="warning"><ul className="list-disc ps-4">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Notice>}

        {wizard && (
          <Card title={t('newStudy')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <TextField label={t('name')} value={form.name} maxLength={200} onChange={(v) => setForm({ ...form, name: v })} placeholder={t(bi('ex. Ouverture d’un café à Rabat', 'مثال: فتح مقهى بالرباط'))} />
              <SelectField label={t('sector')} value={form.sector} onChange={(v) => setForm({ ...form, sector: v })}
                options={SECTORS.map((s) => ({ value: s, label: t(SECTOR_LABEL[s] ?? { fr: s, ar: s }) }))}
                help={t(bi('Le modèle sectoriel pré-remplit les postes (sans montants) et ajoute les indicateurs du secteur.', 'يملأ النموذج القطاعي البنود مسبقاً (دون مبالغ) ويضيف مؤشرات القطاع.'))} />
              <SelectField label={t('projectType')} value={form.projectType} onChange={(v) => setForm({ ...form, projectType: v })}
                options={PROJECT_TYPES.map((p) => ({ value: p, label: t(PROJECT_TYPE_LABEL[p] ?? { fr: p, ar: p }) }))} />
              <div className="flex flex-col gap-1">
                <label htmlFor="wiz-start" className="text-xs font-medium text-gray-600">{t('startMonth')}</label>
                <input id="wiz-start" type="month" value={form.startMonth} onChange={(e) => e.target.value && setForm({ ...form, startMonth: e.target.value })}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
              </div>
              <NumField label={`${t('horizon')} (${t('years')})`} integer min={1} max={MAX_YEARS} value={form.years} onChange={(v) => v != null && setForm({ ...form, years: v })} />
              <div className="flex flex-col gap-2 justify-end">
                <Toggle label={t(bi('Lier à l’entreprise active', 'ربط بالمقاولة النشطة'))} checked={form.linkCompany && company.id != null} disabled={company.id == null}
                  onChange={(v) => setForm({ ...form, linkCompany: v })}
                  help={company.id == null ? t(bi('Aucune entreprise active : l’étude sera un projet non immatriculé.', 'لا توجد مقاولة نشطة: ستكون الدراسة مشروعاً غير مسجل.')) : company.data?.raisonSociale} />
                {form.linkCompany && company.data && (
                  <Toggle label={t(bi('Reprendre l’identité de l’entreprise', 'استعمال معطيات المقاولة'))} checked={form.prefill} onChange={(v) => setForm({ ...form, prefill: v })} />
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" disabled={busy} onClick={() => void create()}>{busy ? t('loading') : t(bi('Créer l’étude', 'إنشاء الدراسة'))}</Button>
              <Button variant="ghost" onClick={() => setWizard(false)}>{t(bi('Annuler', 'إلغاء'))}</Button>
            </div>
          </Card>
        )}

        <Card title={t('studies')} actions={
          <div className="flex flex-wrap gap-4">
            <Toggle label={t(bi('Afficher les archives', 'عرض المؤرشفة'))} checked={includeArchived} onChange={setIncludeArchived} />
            {company.id && <Toggle label={t(bi('Toutes mes entreprises', 'كل مقاولاتي'))} checked={allCompanies} onChange={setAllCompanies} />}
          </div>
        }>
          {studies == null ? <p className="text-xs text-gray-500">{t('loading')}</p> : v2.length === 0 ? (
            <p className="text-sm text-gray-500">{t(bi('Aucune étude pour le moment. Créez votre première étude.', 'لا توجد دراسات حالياً. أنشئ دراستك الأولى.'))}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-xs text-gray-500">
                  <th className="text-start py-2 pe-3">{t('name')}</th>
                  <th className="text-start px-2">{t('status')}</th>
                  <th className="text-start px-2">{t('sector')}</th>
                  <th className="text-start px-2">{t('horizon')}</th>
                  <th className="text-start px-2">{t('updatedAt')}</th>
                  <th className="text-end px-2" />
                </tr></thead>
                <tbody>{v2.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="py-2 pe-3">
                      <Link href={`/etude-projet/${s.id}`} className="font-medium text-gray-800 hover:underline">{s.name}</Link>
                      {s.access !== 'owner' && <span className="ms-2"><Badge tone="blue">{t(s.access === 'edit' ? bi('Partagée (modification)', 'مشاركة (تعديل)') : bi('Partagée (lecture)', 'مشاركة (قراءة)'))}</Badge></span>}
                      {s.access === 'owner' && s.sharing !== 'private' && <span className="ms-2"><Badge tone="blue">{t(`share_${s.sharing}` as const)}</Badge></span>}
                    </td>
                    <td className="px-2"><Badge tone={STATUS_TONE[s.status] ?? 'gray'}>{s.status === 'approved' ? t(s.selfApproved ? 'st_approved_self' : 'st_approved_independent') : t(`st_${s.status as 'draft'}`)}</Badge></td>
                    <td className="px-2 text-xs">{s.sector ? t(SECTOR_LABEL[s.sector] ?? { fr: s.sector, ar: s.sector }) : '—'}</td>
                    <td className="px-2 text-xs" dir="ltr">{s.startMonth ?? '—'} · {s.years ?? '—'} {t('years')}</td>
                    <td className="px-2 text-xs">{date(s.updatedAt)}</td>
                    <td className="px-2 text-end whitespace-nowrap">
                      <Link href={`/etude-projet/${s.id}`} className="text-xs text-blue-700 underline me-2">{t('open')}</Link>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void duplicate(s)}>{t('duplicate')}</Button>
                      {s.access === 'owner' && (s.status === 'archived'
                        ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setStatus(s, 'restore')}>{t('restore')}</Button>
                        : <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setStatus(s, 'archive')}>{t('archive')}</Button>)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>

        {legacy.length > 0 && (
          <Card title={t('legacyStudies')}>
            <p className="text-xs text-gray-500 mb-2">{t(bi('Études créées avec l’ancien assistant. Elles restent inchangées et consultables ; l’import crée une nouvelle étude à partir de leurs réponses.', 'دراسات أنشئت بالمساعد القديم. تبقى دون تغيير وقابلة للاطلاع؛ ينشئ الاستيراد دراسة جديدة انطلاقاً من أجوبتها.'))}</p>
            <ul className="divide-y divide-gray-100">
              {legacy.map((s) => (
                <li key={s.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="flex-1 min-w-[160px]">{s.name}</span>
                  <span className="text-xs text-gray-500">{date(s.updatedAt)}</span>
                  <Link href="/etude-projet/assistant" className="text-xs text-blue-700 underline">{t('openAssistant')}</Link>
                  <Button size="sm" disabled={busy} onClick={() => void importLegacy(s)}>{t('import')}</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
